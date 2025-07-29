import React, { useState, useEffect } from 'react';
import './App.css';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'https://44c25e8e-2b3e-4316-b962-665a2581e188.preview.emergentagent.com';
const API = `${BACKEND_URL}/api`;

// WebSocket connection for real-time updates
let ws = null;

const App = () => {
  const [activeTab, setActiveTab] = useState('applicants');
  const [applicants, setApplicants] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [systemStatus, setSystemStatus] = useState({ is_running: false, current_task: null });
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // WebSocket setup
  useEffect(() => {
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/ws';
    
    try {
      ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'applicant_created' || data.type === 'applicant_updated') {
            fetchApplicants();
          } else if (data.type === 'credential_created' || data.type === 'credential_updated') {
            fetchCredentials();
          } else if (data.type === 'system_status' || data.type === 'system_started' || data.type === 'system_stopped') {
            setSystemStatus(data.data);
          } else if (data.type === 'booking_completed') {
            fetchBookings();
            showMessage('Booking completed successfully!', 'success');
          }
        } catch (error) {
          console.log('WebSocket message received:', event.data);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
      };
    } catch (error) {
      console.error('WebSocket connection failed:', error);
    }
    
    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  // Initial data loading
  useEffect(() => {
    fetchApplicants();
    fetchCredentials();
    fetchSystemStatus();
    fetchBookings();
  }, []);

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 5000);
  };

  // API calls
  const fetchApplicants = async () => {
    try {
      const response = await axios.get(`${API}/applicants`);
      setApplicants(response.data);
    } catch (error) {
      console.error('Error fetching applicants:', error);
      showMessage('Error fetching applicants', 'error');
    }
  };

  const fetchCredentials = async () => {
    try {
      const response = await axios.get(`${API}/credentials`);
      setCredentials(response.data);
    } catch (error) {
      console.error('Error fetching credentials:', error);
      showMessage('Error fetching credentials', 'error');
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const response = await axios.get(`${API}/bls/status`);
      setSystemStatus(response.data);
    } catch (error) {
      console.error('Error fetching system status:', error);
    }
  };

  const fetchBookings = async () => {
    try {
      const response = await axios.get(`${API}/bls/bookings`);
      setBookings(response.data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">BLS-SPANISH</h1>
              <p className="text-blue-200 mt-1">Visa Application Automation System</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`px-3 py-1 rounded-full text-sm ${
                systemStatus.is_running ? 'bg-green-500' : 'bg-red-500'
              }`}>
                {systemStatus.is_running ? 'System Running' : 'System Stopped'}
              </div>
              {systemStatus.current_task && (
                <div className="text-sm text-blue-200">
                  Task: {systemStatus.current_task}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Message Bar */}
      {message.text && (
        <div className={`px-4 py-3 text-center text-white ${
          message.type === 'success' ? 'bg-green-500' : 
          message.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`}>
          {message.text}
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Navigation Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-8">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'applicants', label: 'Applicant Management', icon: '👥' },
              { id: 'credentials', label: 'Credentials Management', icon: '🔐' },
              { id: 'automation', label: 'BLS Automation', icon: '🤖' },
              { id: 'bookings', label: 'Booking History', icon: '📋' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-2 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-lg shadow-sm">
          {activeTab === 'applicants' && (
            <ApplicantManagement 
              applicants={applicants}
              onRefresh={fetchApplicants}
              showMessage={showMessage}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          
          {activeTab === 'credentials' && (
            <CredentialsManagement 
              credentials={credentials}
              onRefresh={fetchCredentials}
              showMessage={showMessage}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          
          {activeTab === 'automation' && (
            <BLSAutomation 
              systemStatus={systemStatus}
              onStatusChange={fetchSystemStatus}
              showMessage={showMessage}
              loading={loading}
              setLoading={setLoading}
            />
          )}
          
          {activeTab === 'bookings' && (
            <BookingHistory 
              bookings={bookings}
              onRefresh={fetchBookings}
              showMessage={showMessage}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Applicant Management Component
const ApplicantManagement = ({ applicants, onRefresh, showMessage, loading, setLoading }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingApplicant, setEditingApplicant] = useState(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    passport_number: '',
    nationality: '',
    date_of_birth: '',
    is_primary: false
  });

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      passport_number: '',
      nationality: '',
      date_of_birth: '',
      is_primary: false
    });
    setEditingApplicant(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingApplicant) {
        await axios.put(`${API}/applicants/${editingApplicant.id}`, formData);
        showMessage('Applicant updated successfully!', 'success');
      } else {
        await axios.post(`${API}/applicants`, formData);
        showMessage('Applicant created successfully!', 'success');
      }
      
      onRefresh();
      resetForm();
    } catch (error) {
      showMessage('Error saving applicant', 'error');
      console.error('Error saving applicant:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (applicant) => {
    setFormData(applicant);
    setEditingApplicant(applicant);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this applicant?')) return;
    
    setLoading(true);
    try {
      await axios.delete(`${API}/applicants/${id}`);
      showMessage('Applicant deleted successfully!', 'success');
      onRefresh();
    } catch (error) {
      showMessage('Error deleting applicant', 'error');
      console.error('Error deleting applicant:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Applicant Management</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add New Applicant
        </button>
      </div>

      {/* Applicant Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingApplicant ? 'Edit Applicant' : 'Add New Applicant'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">First Name</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Last Name</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Passport Number</label>
                <input
                  type="text"
                  value={formData.passport_number}
                  onChange={(e) => setFormData({...formData, passport_number: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Nationality</label>
                <input
                  type="text"
                  value={formData.nationality}
                  onChange={(e) => setFormData({...formData, nationality: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Date of Birth</label>
                <input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_primary}
                  onChange={(e) => setFormData({...formData, is_primary: e.target.checked})}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">Set as Primary Applicant</label>
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : editingApplicant ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Applicants List */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Passport</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {applicants.map((applicant) => (
              <tr key={applicant.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {applicant.first_name} {applicant.last_name}
                      </div>
                      <div className="text-sm text-gray-500">{applicant.nationality}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{applicant.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{applicant.phone}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{applicant.passport_number}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {applicant.is_primary ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Primary
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Secondary
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleEdit(applicant)}
                    className="text-indigo-600 hover:text-indigo-900 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(applicant.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {applicants.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No applicants found. Add your first applicant to get started.
          </div>
        )}
      </div>
    </div>
  );
};

// Credentials Management Component
const CredentialsManagement = ({ credentials, onRefresh, showMessage, loading, setLoading }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingCredential, setEditingCredential] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    is_primary: false,
    is_active: true
  });

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      name: '',
      is_primary: false,
      is_active: true
    });
    setEditingCredential(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingCredential) {
        await axios.put(`${API}/credentials/${editingCredential.id}`, formData);
        showMessage('Credential updated successfully!', 'success');
      } else {
        await axios.post(`${API}/credentials`, formData);
        showMessage('Credential created successfully!', 'success');
      }
      
      onRefresh();
      resetForm();
    } catch (error) {
      showMessage('Error saving credential', 'error');
      console.error('Error saving credential:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (credential) => {
    setFormData(credential);
    setEditingCredential(credential);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this credential?')) return;
    
    setLoading(true);
    try {
      await axios.delete(`${API}/credentials/${id}`);
      showMessage('Credential deleted successfully!', 'success');
      onRefresh();
    } catch (error) {
      showMessage('Error deleting credential', 'error');
      console.error('Error deleting credential:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrimary = async (id) => {
    setLoading(true);
    try {
      await axios.post(`${API}/credentials/${id}/set-primary`);
      showMessage('Primary credential updated!', 'success');
      onRefresh();
    } catch (error) {
      showMessage('Error updating primary credential', 'error');
      console.error('Error setting primary credential:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestCredential = async (id) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/credentials/${id}/test`);
      showMessage(`Credential test: ${response.data.message}`, 'success');
      onRefresh();
    } catch (error) {
      showMessage('Credential test failed', 'error');
      console.error('Error testing credential:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Credentials Management</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Add New Credential
        </button>
      </div>

      {/* Credential Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingCredential ? 'Edit Credential' : 'Add New Credential'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Account Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  required
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_primary}
                  onChange={(e) => setFormData({...formData, is_primary: e.target.checked})}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">Set as Primary Credential</label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
                <label className="ml-2 block text-sm text-gray-900">Active</label>
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : editingCredential ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credentials List */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Used</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {credentials.map((credential) => (
              <tr key={credential.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{credential.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{credential.email}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex space-x-2">
                    {credential.is_primary && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Primary
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      credential.is_active ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {credential.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {credential.last_used ? new Date(credential.last_used).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex space-x-2">
                    {!credential.is_primary && (
                      <button
                        onClick={() => handleSetPrimary(credential.id)}
                        className="text-green-600 hover:text-green-900"
                      >
                        Set Primary
                      </button>
                    )}
                    <button
                      onClick={() => handleTestCredential(credential.id)}
                      className="text-yellow-600 hover:text-yellow-900"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => handleEdit(credential)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(credential.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {credentials.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No credentials found. Add your first credential to get started.
          </div>
        )}
      </div>
    </div>
  );
};

// Enhanced BLS Automation Component with Real BLS Integration
const BLSAutomation = ({ systemStatus, onStatusChange, showMessage, loading, setLoading }) => {
  const [visaInfo, setVisaInfo] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    location: 'Oran',
    visa_type: 'National Visa',
    visa_sub_type: 'Tourism',
    category: 'ORAN 1',
    appointment_for: 'Individual',
    number_of_members: 1,
    schengen_visa_history: 'never',
    has_premium_lounge: false,
    family_group_eligible: false,
    notes: ''
  });

  const [categoryValidation, setCategoryValidation] = useState({ is_valid: true, message: '', recommended_categories: [] });
  const [showValidationModal, setShowValidationModal] = useState(false);

  const [captchaForm, setCaptchaForm] = useState({
    target_number: '7',
    captcha_images: []
  });

  // Load visa info on component mount
  useEffect(() => {
    fetchVisaInfo();
  }, []);

  const fetchVisaInfo = async () => {
    try {
      const response = await axios.get(`${API}/bls/visa-info`);
      setVisaInfo(response.data);
    } catch (error) {
      console.error('Error fetching visa info:', error);
      showMessage('Error loading visa information', 'error');
    }
  };

  // Update categories when location changes
  const handleLocationChange = (location) => {
    if (!visaInfo) return;
    
    const categories = visaInfo.categories_by_location[location] || [];
    const newCategory = categories[0] || 'ORAN 1';
    
    setBookingForm({
      ...bookingForm,
      location: location,
      category: newCategory
    });
    
    // Validate new category
    validateCategory(newCategory, bookingForm.schengen_visa_history);
  };

  // Validate category selection
  const validateCategory = async (category, schengenHistory) => {
    try {
      const response = await axios.post(`${API}/bls/validate-category`, {
        location: bookingForm.location,
        category: category,
        schengen_visa_history: schengenHistory
      });
      
      setCategoryValidation(response.data);
      
      if (!response.data.is_valid) {
        showMessage(response.data.message, 'error');
      }
    } catch (error) {
      console.error('Error validating category:', error);
    }
  };

  // Handle Schengen history change
  const handleSchengenHistoryChange = (history) => {
    setBookingForm({
      ...bookingForm,
      schengen_visa_history: history
    });
    
    validateCategory(bookingForm.category, history);
  };

  // Handle category change
  const handleCategoryChange = (category) => {
    setBookingForm({
      ...bookingForm,
      category: category
    });
    
    validateCategory(category, bookingForm.schengen_visa_history);
  };

  const handleStartSystem = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/bls/start`);
      showMessage('BLS automation system started!', 'success');
      onStatusChange();
    } catch (error) {
      showMessage('Error starting system', 'error');
      console.error('Error starting system:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStopSystem = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/bls/stop`);
      showMessage('BLS automation system stopped!', 'success');
      onStatusChange();
    } catch (error) {
      showMessage('Error stopping system', 'error');
      console.error('Error stopping system:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    
    // Check category validation before booking
    if (!categoryValidation.is_valid) {
      setShowValidationModal(true);
      return;
    }
    
    setLoading(true);
    try {
      const response = await axios.post(`${API}/bls/book-appointment`, bookingForm);
      showMessage(`Appointment booking completed! ID: ${response.data.booking_id}`, 'success');
    } catch (error) {
      const errorMessage = error.response?.data?.detail || 'Error booking appointment';
      showMessage(errorMessage, 'error');
      console.error('Error booking appointment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSolveCaptcha = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await axios.post(`${API}/bls/solve-captcha`, captchaForm);
      showMessage(`Captcha solved! Confidence: ${response.data.confidence}`, 'success');
    } catch (error) {
      showMessage('Error solving captcha', 'error');
      console.error('Error solving captcha:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!visaInfo) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-500">Loading visa information...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">BLS Automation System</h2>
        <div className="flex space-x-3">
          {systemStatus.is_running ? (
            <button
              onClick={handleStopSystem}
              disabled={loading}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Stop System
            </button>
          ) : (
            <button
              onClick={handleStartSystem}
              disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              Start System
            </button>
          )}
        </div>
      </div>

      {/* Validation Modal */}
      {showValidationModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.498 0L3.316 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Category Validation Error</h3>
              <p className="text-sm text-gray-600 mb-4">{categoryValidation.message}</p>
              <p className="text-xs text-red-600 mb-4">
                ⚠️ Incorrect category selection will result in rejection at the visa center with no refund of service fees.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowValidationModal(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
                >
                  Review Selection
                </button>
                <button
                  onClick={() => {
                    setShowValidationModal(false);
                    handleBookAppointment({ preventDefault: () => {} });
                  }}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700"
                >
                  Proceed Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Status Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">System Status</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className={`font-medium ${systemStatus.is_running ? 'text-green-600' : 'text-red-600'}`}>
                {systemStatus.is_running ? 'Running' : 'Stopped'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Current Task:</span>
              <span className="font-medium">{systemStatus.current_task || 'None'}</span>
            </div>
            <div className="flex justify-between">
              <span>Last Update:</span>
              <span className="font-medium">
                {systemStatus.last_update ? new Date(systemStatus.last_update).toLocaleString() : 'Never'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button
              onClick={() => onStatusChange()}
              className="w-full bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200"
            >
              Refresh Status
            </button>
            <button
              onClick={() => fetchVisaInfo()}
              className="w-full bg-green-100 text-green-700 px-4 py-2 rounded-lg hover:bg-green-200"
            >
              Refresh Visa Info
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Booking Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">📋 Book Appointment</h3>
          <form onSubmit={handleBookAppointment} className="space-y-4">
            
            {/* Schengen Visa History */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Schengen Visa History *
              </label>
              <select
                value={bookingForm.schengen_visa_history}
                onChange={(e) => handleSchengenHistoryChange(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {visaInfo.schengen_history_options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Select your Schengen visa history to determine eligible categories.
              </p>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
              <select
                value={bookingForm.location}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {visaInfo.locations.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>
            
            {/* Category with Validation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <select
                value={bookingForm.category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className={`mt-1 block w-full border rounded-md px-3 py-2 text-sm ${
                  categoryValidation.is_valid ? 'border-gray-300' : 'border-red-500'
                }`}
              >
                {visaInfo.categories_by_location[bookingForm.location]?.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              {categoryValidation.message && (
                <p className={`mt-1 text-xs ${categoryValidation.is_valid ? 'text-green-600' : 'text-red-600'}`}>
                  {categoryValidation.message}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                {visaInfo.category_requirements[bookingForm.category]}
              </p>
            </div>
            
            {/* Visa Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visa Type *</label>
              <select
                value={bookingForm.visa_type}
                onChange={(e) => setBookingForm({...bookingForm, visa_type: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {visaInfo.visa_types.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            
            {/* Visa Sub-Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visa Sub-Type *</label>
              <select
                value={bookingForm.visa_sub_type}
                onChange={(e) => setBookingForm({...bookingForm, visa_sub_type: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {visaInfo.visa_sub_types.map((subType) => (
                  <option key={subType} value={subType}>{subType}</option>
                ))}
              </select>
            </div>
            
            {/* Appointment For */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Appointment For *</label>
              <select
                value={bookingForm.appointment_for}
                onChange={(e) => setBookingForm({...bookingForm, appointment_for: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="Individual">Individual</option>
                <option value="Family">Family</option>
              </select>
            </div>
            
            {/* Number of Members for Family */}
            {bookingForm.appointment_for === 'Family' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Members</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={bookingForm.number_of_members}
                  onChange={(e) => setBookingForm({...bookingForm, number_of_members: parseInt(e.target.value)})}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Family members must have same surname (except spouses). Proof of relationship required if surnames differ.
                </p>
              </div>
            )}

            {/* Premium Lounge */}
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={bookingForm.has_premium_lounge}
                onChange={(e) => setBookingForm({...bookingForm, has_premium_lounge: e.target.checked})}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-900">Premium Lounge Service</label>
            </div>
            <p className="text-xs text-gray-500 -mt-2">
              ℹ️ Premium lounge is optional and does not guarantee earlier appointments.
            </p>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
              <textarea
                value={bookingForm.notes}
                onChange={(e) => setBookingForm({...bookingForm, notes: e.target.value})}
                rows="2"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="Any additional notes..."
              />
            </div>
            
            <button
              type="submit"
              disabled={loading || !systemStatus.is_running}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Booking...' : 'Book Appointment'}
            </button>
          </form>
        </div>

        {/* Captcha Solver */}
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">🔍 Captcha Solver</h3>
          <form onSubmit={handleSolveCaptcha} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Number</label>
              <input
                type="text"
                value={captchaForm.target_number}
                onChange={(e) => setCaptchaForm({...captchaForm, target_number: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                placeholder="Enter the number to find"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Captcha Images</label>
              <div className="mt-1 p-4 border-2 border-dashed border-gray-300 rounded-md text-center">
                <p className="text-sm text-gray-500">
                  In a real implementation, you would upload captcha images here.
                  For demo purposes, click "Solve Captcha" to test the API.
                </p>
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Solving...' : 'Solve Captcha'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// Enhanced Booking History Component
const BookingHistory = ({ bookings, onRefresh, showMessage }) => {
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Booking History</h2>
        <button
          onClick={onRefresh}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Booking ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visa Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schengen History</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {booking.id.substring(0, 8)}...
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {booking.booking_details?.location || booking.booking_request?.location || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {booking.booking_details?.visa_type || booking.booking_request?.visa_type || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {booking.booking_details?.category || booking.booking_request?.category || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {booking.booking_details?.schengen_history || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    booking.status === 'completed' ? 'bg-green-100 text-green-800' : 
                    booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-red-100 text-red-800'
                  }`}>
                    {booking.status || 'Unknown'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {booking.created_at ? new Date(booking.created_at).toLocaleString() : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {bookings.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No bookings found. Start the automation system and book an appointment to see history.
          </div>
        )}
      </div>
    </div>
  );
};

export default App;