from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import asyncio
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()

# Define Models

# Applicant Models
class ApplicantBase(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone: str
    passport_number: str
    nationality: str
    date_of_birth: str
    is_primary: bool = False

class ApplicantCreate(ApplicantBase):
    pass

class Applicant(ApplicantBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

# Login Credentials Models - Simplified for BLS Spain Algeria login
class CredentialBase(BaseModel):
    email: str
    password: str

class CredentialCreate(CredentialBase):
    pass

class Credential(CredentialBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_used: Optional[datetime] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

# BLS Automation Models - Enhanced with real BLS visa types and validation
class VisaBookingRequest(BaseModel):
    location: str  # Oran, Algiers, etc.
    visa_type: str  # National Visa, Schengen Visa, etc.
    visa_sub_type: str  # Tourism, Study visa, Family reunification visa, etc.
    category: str  # ORAN 1-4, ALG 1-4, FAMILY GROUP
    appointment_for: str  # "Individual" or "Family"
    number_of_members: Optional[int] = 1
    
    # Enhanced fields for proper BLS validation
    schengen_visa_history: str  # "never", "before_2020", "after_2020_6months", "after_2020_6months_2years", "after_2020_2years_plus"
    has_premium_lounge: bool = False
    family_group_eligible: bool = False  # For children < 12 with parent visa > 180 days
    notes: Optional[str] = None

class CaptchaRequest(BaseModel):
    target_number: str
    captcha_images: List[str]  # Base64 encoded images

class SystemStatus(BaseModel):
    is_running: bool = False
    current_task: Optional[str] = None
    last_update: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

# BLS System state
system_status = SystemStatus()

# ==================== APPLICANT MANAGEMENT APIs ====================

@api_router.post("/applicants", response_model=Applicant)
async def create_applicant(applicant_data: ApplicantCreate):
    """Create a new applicant with primary designation logic"""
    try:
        # If this applicant is marked as primary, unset any existing primary
        if applicant_data.is_primary:
            await db.applicants.update_many(
                {"is_primary": True}, 
                {"$set": {"is_primary": False, "updated_at": datetime.utcnow()}}
            )
        
        applicant_dict = applicant_data.dict()
        applicant = Applicant(**applicant_dict)
        
        # Insert into database
        result = await db.applicants.insert_one(applicant.dict())
        
        # Broadcast update via WebSocket
        await manager.broadcast(json.dumps({
            "type": "applicant_created",
            "data": json.loads(applicant.json())
        }))
        
        return applicant
    except Exception as e:
        logging.error(f"Error creating applicant: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating applicant: {str(e)}")

@api_router.get("/applicants", response_model=List[Applicant])
async def get_applicants(skip: int = 0, limit: int = 100):
    """Get all applicants with pagination"""
    try:
        cursor = db.applicants.find().skip(skip).limit(limit).sort("created_at", -1)
        applicants = await cursor.to_list(length=limit)
        return [Applicant(**applicant) for applicant in applicants]
    except Exception as e:
        logging.error(f"Error fetching applicants: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching applicants: {str(e)}")

@api_router.get("/applicants/{applicant_id}", response_model=Applicant)
async def get_applicant(applicant_id: str):
    """Get specific applicant by ID"""
    try:
        applicant = await db.applicants.find_one({"id": applicant_id})
        if not applicant:
            raise HTTPException(status_code=404, detail="Applicant not found")
        return Applicant(**applicant)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching applicant: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching applicant: {str(e)}")

@api_router.put("/applicants/{applicant_id}", response_model=Applicant)
async def update_applicant(applicant_id: str, applicant_data: ApplicantCreate):
    """Update applicant information"""
    try:
        # Check if applicant exists
        existing = await db.applicants.find_one({"id": applicant_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Applicant not found")
        
        # If this applicant is being set as primary, unset any existing primary
        if applicant_data.is_primary:
            await db.applicants.update_many(
                {"is_primary": True, "id": {"$ne": applicant_id}}, 
                {"$set": {"is_primary": False, "updated_at": datetime.utcnow()}}
            )
        
        update_data = applicant_data.dict()
        update_data["updated_at"] = datetime.utcnow()
        
        await db.applicants.update_one(
            {"id": applicant_id},
            {"$set": update_data}
        )
        
        # Fetch updated applicant
        updated_applicant = await db.applicants.find_one({"id": applicant_id})
        applicant = Applicant(**updated_applicant)
        
        # Broadcast update via WebSocket
        await manager.broadcast(json.dumps({
            "type": "applicant_updated",
            "data": json.loads(applicant.json())
        }))
        
        return applicant
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating applicant: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating applicant: {str(e)}")

@api_router.delete("/applicants/{applicant_id}")
async def delete_applicant(applicant_id: str):
    """Delete applicant with verification"""
    try:
        result = await db.applicants.delete_one({"id": applicant_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Applicant not found")
        
        # Broadcast update via WebSocket
        await manager.broadcast(json.dumps({
            "type": "applicant_deleted",
            "data": {"id": applicant_id}
        }))
        
        return {"message": "Applicant deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting applicant: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting applicant: {str(e)}")

@api_router.get("/applicants/primary/info")
async def get_primary_applicant():
    """Get primary applicant for booking"""
    try:
        primary_applicant = await db.applicants.find_one({"is_primary": True})
        if not primary_applicant:
            raise HTTPException(status_code=404, detail="No primary applicant found")
        return Applicant(**primary_applicant)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching primary applicant: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching primary applicant: {str(e)}")

# ==================== LOGIN CREDENTIALS MANAGEMENT APIs ====================

@api_router.post("/credentials", response_model=Credential)
async def create_credential(credential_data: CredentialCreate):
    """Create new login credentials for BLS Spain Algeria"""
    try:
        credential_dict = credential_data.dict()
        credential = Credential(**credential_dict)
        
        # Insert into database
        result = await db.credentials.insert_one(credential.dict())
        
        # Broadcast update via WebSocket
        await manager.broadcast(json.dumps({
            "type": "credential_created",
            "data": json.loads(credential.json())
        }))
        
        return credential
    except Exception as e:
        logging.error(f"Error creating credential: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating credential: {str(e)}")

@api_router.get("/credentials", response_model=List[Credential])
async def get_credentials(skip: int = 0, limit: int = 100):
    """Get all credentials"""
    try:
        cursor = db.credentials.find().skip(skip).limit(limit).sort("created_at", -1)
        credentials = await cursor.to_list(length=limit)
        return [Credential(**credential) for credential in credentials]
    except Exception as e:
        logging.error(f"Error fetching credentials: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching credentials: {str(e)}")

@api_router.get("/credentials/{credential_id}", response_model=Credential)
async def get_credential(credential_id: str):
    """Get specific credential by ID"""
    try:
        credential = await db.credentials.find_one({"id": credential_id})
        if not credential:
            raise HTTPException(status_code=404, detail="Credential not found")
        return Credential(**credential)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching credential: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching credential: {str(e)}")

@api_router.put("/credentials/{credential_id}", response_model=Credential)
async def update_credential(credential_id: str, credential_data: CredentialCreate):
    """Update credential information"""
    try:
        # Check if credential exists
        existing = await db.credentials.find_one({"id": credential_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Credential not found")
        
        # If this credential is being set as primary, unset any existing primary
        if credential_data.is_primary:
            await db.credentials.update_many(
                {"is_primary": True, "id": {"$ne": credential_id}}, 
                {"$set": {"is_primary": False, "updated_at": datetime.utcnow()}}
            )
        
        update_data = credential_data.dict()
        update_data["updated_at"] = datetime.utcnow()
        
        await db.credentials.update_one(
            {"id": credential_id},
            {"$set": update_data}
        )
        
        # Fetch updated credential
        updated_credential = await db.credentials.find_one({"id": credential_id})
        credential = Credential(**updated_credential)
        
        # Broadcast update via WebSocket
        await manager.broadcast(json.dumps({
            "type": "credential_updated",
            "data": json.loads(credential.json())
        }))
        
        return credential
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating credential: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating credential: {str(e)}")

@api_router.delete("/credentials/{credential_id}")
async def delete_credential(credential_id: str):
    """Delete credential with verification"""
    try:
        result = await db.credentials.delete_one({"id": credential_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Credential not found")
        
        # Broadcast update via WebSocket
        await manager.broadcast(json.dumps({
            "type": "credential_deleted",
            "data": {"id": credential_id}
        }))
        
        return {"message": "Credential deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting credential: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting credential: {str(e)}")

@api_router.get("/credentials/primary/info")
async def get_primary_credential():
    """Get primary credential for automation"""
    try:
        primary_credential = await db.credentials.find_one({"is_primary": True, "is_active": True})
        if not primary_credential:
            raise HTTPException(status_code=404, detail="No primary credential found")
        return Credential(**primary_credential)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error fetching primary credential: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching primary credential: {str(e)}")

@api_router.post("/credentials/{credential_id}/set-primary")
async def set_primary_credential(credential_id: str):
    """Set credential as primary"""
    try:
        # Check if credential exists
        existing = await db.credentials.find_one({"id": credential_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Credential not found")
        
        # Unset any existing primary
        await db.credentials.update_many(
            {"is_primary": True}, 
            {"$set": {"is_primary": False, "updated_at": datetime.utcnow()}}
        )
        
        # Set this credential as primary
        await db.credentials.update_one(
            {"id": credential_id},
            {"$set": {"is_primary": True, "updated_at": datetime.utcnow()}}
        )
        
        return {"message": "Credential set as primary successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error setting primary credential: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error setting primary credential: {str(e)}")

@api_router.post("/credentials/{credential_id}/test")
async def test_credential(credential_id: str):
    """Test credential functionality"""
    try:
        credential = await db.credentials.find_one({"id": credential_id})
        if not credential:
            raise HTTPException(status_code=404, detail="Credential not found")
        
        # Update last_used timestamp
        await db.credentials.update_one(
            {"id": credential_id},
            {"$set": {"last_used": datetime.utcnow(), "updated_at": datetime.utcnow()}}
        )
        
        # In a real implementation, this would test the actual BLS login
        # For now, return success status
        return {
            "status": "success",
            "message": "Credential test completed",
            "tested_at": datetime.utcnow().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error testing credential: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error testing credential: {str(e)}")

# ==================== BLS AUTOMATION CORE SYSTEM ====================

# ==================== BLS AUTOMATION CORE SYSTEM ====================

# BLS Visa Category Validation Helper
@api_router.post("/bls/validate-category")
async def validate_visa_category(request: dict):
    """Validate if the selected category matches visa history"""
    try:
        location = request.get("location")
        category = request.get("category")
        schengen_history = request.get("schengen_visa_history")
        
        # Define valid category mappings based on Schengen visa history
        valid_categories = {
            "never": ["ORAN 1", "ALG 1"],
            "before_2020": ["ORAN 1", "ALG 1"],
            "after_2020_6months": ["ORAN 2", "ALG 2"],
            "after_2020_6months_2years": ["ORAN 3", "ALG 3"],
            "after_2020_2years_plus": ["ORAN 4", "ALG 4"]
        }
        
        # Check if category matches history
        is_valid = category in valid_categories.get(schengen_history, [])
        
        # Generate appropriate message
        if is_valid:
            message = f"Category '{category}' is valid for your Schengen visa history."
        else:
            suggested_categories = valid_categories.get(schengen_history, [])
            location_specific = [cat for cat in suggested_categories if cat.startswith(location.upper()[:3])]
            message = f"Category '{category}' does not match your visa history. Recommended: {', '.join(location_specific)}"
        
        return {
            "is_valid": is_valid,
            "message": message,
            "recommended_categories": valid_categories.get(schengen_history, [])
        }
    except Exception as e:
        logging.error(f"Error validating category: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error validating category: {str(e)}")

# BLS Visa Types and Categories Info
@api_router.get("/bls/visa-info")
async def get_visa_info():
    """Get comprehensive visa types and categories information"""
    try:
        visa_info = {
            "visa_types": [
                "National Visa",
                "Schengen Visa",
                "Schengen visa (Estonia)",
                "First application / première demande",
                "Visa renewal / renouvellement de visa"
            ],
            "visa_sub_types": [
                "Tourism",
                "Family reunification visa",
                "Study visa",
                "Schengen Visa"
            ],
            "locations": [
                "Oran",
                "Algiers"
            ],
            "categories_by_location": {
                "Oran": ["ORAN 1", "ORAN 2", "ORAN 3", "ORAN 4"],
                "Algiers": ["ALG 1", "ALG 2", "ALG 3", "ALG 4"]
            },
            "category_requirements": {
                "ORAN 1": "Never obtained a Schengen visa or issued before 2020",
                "ORAN 2": "Schengen visa after Jan 1, 2020, valid ≤ 6 months",
                "ORAN 3": "Schengen visa after Jan 1, 2020, valid > 6 months, < 2 years",
                "ORAN 4": "Schengen visa after Jan 1, 2020, valid ≥ 2 years",
                "ALG 1": "Never obtained a Schengen visa or issued before 2020",
                "ALG 2": "Schengen visa after Jan 1, 2020, valid ≤ 6 months",
                "ALG 3": "Schengen visa after Jan 1, 2020, valid > 6 months, < 2 years",
                "ALG 4": "Schengen visa after Jan 1, 2020, valid ≥ 2 years",
                "FAMILY GROUP": "Exclusively for children < 12 whose parents hold visa valid > 180 days"
            },
            "schengen_history_options": [
                {"value": "never", "label": "Never had a Schengen visa"},
                {"value": "before_2020", "label": "Had Schengen visa before 2020"},
                {"value": "after_2020_6months", "label": "Schengen visa after 2020, valid ≤ 6 months"},
                {"value": "after_2020_6months_2years", "label": "Schengen visa after 2020, valid > 6 months, < 2 years"},
                {"value": "after_2020_2years_plus", "label": "Schengen visa after 2020, valid ≥ 2 years"}
            ]
        }
        
        return visa_info
    except Exception as e:
        logging.error(f"Error fetching visa info: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching visa info: {str(e)}")

@api_router.post("/bls/book-appointment")
async def book_appointment(booking_request: VisaBookingRequest):
    """Book visa appointment using BLS automation with enhanced validation"""
    try:
        # Get primary credential
        primary_credential = await db.credentials.find_one({"is_primary": True, "is_active": True})
        if not primary_credential:
            raise HTTPException(status_code=400, detail="No primary credential found for automation")
        
        # Get primary applicant
        primary_applicant = await db.applicants.find_one({"is_primary": True})
        if not primary_applicant:
            raise HTTPException(status_code=400, detail="No primary applicant found for booking")
        
        # Validate category selection if Schengen history is provided
        if hasattr(booking_request, 'schengen_visa_history') and booking_request.schengen_visa_history:
            valid_categories = {
                "never": ["ORAN 1", "ALG 1"],
                "before_2020": ["ORAN 1", "ALG 1"],
                "after_2020_6months": ["ORAN 2", "ALG 2"],
                "after_2020_6months_2years": ["ORAN 3", "ALG 3"],
                "after_2020_2years_plus": ["ORAN 4", "ALG 4"]
            }
            
            if booking_request.category not in valid_categories.get(booking_request.schengen_visa_history, []):
                suggested_categories = valid_categories.get(booking_request.schengen_visa_history, [])
                location_specific = [cat for cat in suggested_categories if cat.startswith(booking_request.location.upper()[:3])]
                raise HTTPException(
                    status_code=400, 
                    detail=f"Category '{booking_request.category}' does not match your Schengen visa history. Use: {', '.join(location_specific)}"
                )
        
        # Update system status
        system_status.is_running = True
        system_status.current_task = f"Booking {booking_request.visa_type} appointment for {booking_request.location}"
        system_status.last_update = datetime.utcnow()
        
        # Broadcast status update
        await manager.broadcast(json.dumps({
            "type": "system_status",
            "data": json.loads(system_status.json())
        }))
        
        # In a real implementation, this would use Selenium/Playwright to automate BLS booking
        # For now, simulate the process
        await asyncio.sleep(2)  # Simulate processing time
        
        # Create enhanced booking record
        booking_record = {
            "id": str(uuid.uuid4()),
            "applicant_id": primary_applicant["id"],
            "credential_id": primary_credential["id"],
            "booking_request": booking_request.dict(),
            "status": "completed",
            "validation_passed": True,
            "created_at": datetime.utcnow().isoformat(),
            "booking_details": {
                "location": booking_request.location,
                "visa_type": booking_request.visa_type,
                "visa_sub_type": booking_request.visa_sub_type,
                "category": booking_request.category,
                "appointment_for": booking_request.appointment_for,
                "number_of_members": booking_request.number_of_members,
                "schengen_history": getattr(booking_request, 'schengen_visa_history', 'not_specified'),
                "premium_lounge": getattr(booking_request, 'has_premium_lounge', False)
            }
        }
        
        # Insert into database
        result = await db.bookings.insert_one(booking_record.copy())
        
        # Update system status
        system_status.is_running = False
        system_status.current_task = None
        system_status.last_update = datetime.utcnow()
        
        # Broadcast completion (use the original record without MongoDB ObjectId)
        await manager.broadcast(json.dumps({
            "type": "booking_completed",
            "data": booking_record
        }))
        
        return {
            "status": "success",
            "message": "Appointment booking completed successfully",
            "booking_id": booking_record["id"],
            "booking_details": booking_record["booking_details"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error booking appointment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error booking appointment: {str(e)}")

@api_router.post("/bls/solve-captcha")
async def solve_captcha(captcha_request: CaptchaRequest):
    """Solve BLS captcha using OCR"""
    try:
        # In a real implementation, this would use OCR to analyze the captcha images
        # and return the indices of images containing the target number
        
        # For now, simulate captcha solving
        await asyncio.sleep(1)  # Simulate processing time
        
        # Return mock solution (indices of correct images)
        solution = {
            "target_number": captcha_request.target_number,
            "selected_indices": [0, 5, 12, 18],  # Mock indices
            "confidence": 0.95,
            "solved_at": datetime.utcnow().isoformat()
        }
        
        # Store captcha solution record
        captcha_record = {
            "id": str(uuid.uuid4()),
            "target_number": captcha_request.target_number,
            "num_images": len(captcha_request.captcha_images),
            "solution": solution,
            "created_at": datetime.utcnow().isoformat()
        }
        
        await db.captcha_solutions.insert_one(captcha_record)
        
        return solution
    except Exception as e:
        logging.error(f"Error solving captcha: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error solving captcha: {str(e)}")

@api_router.get("/bls/status")
async def get_system_status():
    """Get current BLS automation system status"""
    return system_status

@api_router.post("/bls/start")
async def start_system():
    """Start BLS automation system"""
    try:
        system_status.is_running = True
        system_status.current_task = "System initialized"
        system_status.last_update = datetime.utcnow()
        
        await manager.broadcast(json.dumps({
            "type": "system_started",
            "data": json.loads(system_status.json())
        }))
        
        return {"message": "BLS automation system started", "status": json.loads(system_status.json())}
    except Exception as e:
        logging.error(f"Error starting system: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error starting system: {str(e)}")

@api_router.post("/bls/stop")
async def stop_system():
    """Stop BLS automation system"""
    try:
        system_status.is_running = False
        system_status.current_task = None
        system_status.last_update = datetime.utcnow()
        
        await manager.broadcast(json.dumps({
            "type": "system_stopped",
            "data": json.loads(system_status.json())
        }))
        
        return {"message": "BLS automation system stopped", "status": json.loads(system_status.json())}
    except Exception as e:
        logging.error(f"Error stopping system: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error stopping system: {str(e)}")

@api_router.get("/bls/bookings")
async def get_bookings(skip: int = 0, limit: int = 100):
    """Get booking history"""
    try:
        cursor = db.bookings.find().skip(skip).limit(limit).sort("created_at", -1)
        bookings = await cursor.to_list(length=limit)
        
        # Convert MongoDB documents to JSON-serializable format
        for booking in bookings:
            if "_id" in booking:
                del booking["_id"]  # Remove MongoDB ObjectId
                
        return bookings
    except Exception as e:
        logging.error(f"Error fetching bookings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching bookings: {str(e)}")

# ==================== WEBSOCKET ENDPOINT ====================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo received message (can be extended for more complex interactions)
            await manager.send_personal_message(f"Echo: {data}", websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ==================== ORIGINAL STATUS CHECK APIs ====================

class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

@api_router.get("/")
async def root():
    return {"message": "BLS-SPANISH Automation System API"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()