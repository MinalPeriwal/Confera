"use client";

import { useState } from "react";
import { User, Camera, Mic, Monitor, Shield, Bell } from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'video' | 'audio'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Mock form state
  const [formData, setFormData] = useState({
    displayName: "Minal",
    email: "minal@example.com",
    personalMeetingId: "485 574 916",
    cameraEnabled: true,
    micEnabled: false,
    blurBackground: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    
    // Simulate API call
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 800);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[70vh]">
      {/* Settings Sidebar */}
      <div className="w-full md:w-64 bg-slate-50 border-r border-slate-200 p-6 flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-800 mb-6">Settings</h1>
        <nav className="space-y-1">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'profile' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <User className="w-4 h-4" /> Profile
          </button>
          <button 
            onClick={() => setActiveTab('video')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'video' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Camera className="w-4 h-4" /> Video
          </button>
          <button 
            onClick={() => setActiveTab('audio')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'audio' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Mic className="w-4 h-4" /> Audio
          </button>
          
          <div className="pt-4 mt-4 border-t border-slate-200">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              <Monitor className="w-4 h-4" /> Virtual Background
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              <Shield className="w-4 h-4" /> Security
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              <Bell className="w-4 h-4" /> Notifications
            </button>
          </div>
        </nav>
      </div>
      
      {/* Settings Content */}
      <div className="flex-1 p-8 md:p-10">
        <form onSubmit={handleSave} className="max-w-2xl">
          {activeTab === 'profile' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">Profile Settings</h2>
                
                <div className="flex items-center gap-6 mb-8">
                  <div className="w-24 h-24 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-sm">
                    {formData.displayName.charAt(0)}
                  </div>
                  <div>
                    <button type="button" className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                      Change Picture
                    </button>
                  </div>
                </div>
                
                <div className="grid gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
                    <input 
                      type="text" 
                      name="displayName"
                      value={formData.displayName}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                    <input 
                      type="email" 
                      name="email"
                      value={formData.email}
                      disabled
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                    />
                    <p className="text-xs text-slate-500 mt-1">Contact your administrator to change your email.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Personal Meeting ID</label>
                    <input 
                      type="text" 
                      name="personalMeetingId"
                      value={formData.personalMeetingId}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'video' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">Video Settings</h2>
                
                <div className="bg-slate-900 rounded-xl aspect-video flex items-center justify-center text-slate-500 mb-6">
                  <Camera className="w-12 h-12 opacity-50 mb-2" />
                  <span className="ml-2">Camera Preview</span>
                </div>
                
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">
                    <div>
                      <span className="block font-medium text-slate-800">Turn off my video when joining meeting</span>
                      <span className="block text-sm text-slate-500">Automatically disable your camera when entering a room</span>
                    </div>
                    <input 
                      type="checkbox" 
                      name="cameraEnabled"
                      checked={!formData.cameraEnabled}
                      onChange={(e) => setFormData(prev => ({...prev, cameraEnabled: !e.target.checked}))}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                  </label>
                  
                  <label className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">
                    <div>
                      <span className="block font-medium text-slate-800">Blur my background</span>
                      <span className="block text-sm text-slate-500">Obscure your surroundings during video calls</span>
                    </div>
                    <input 
                      type="checkbox" 
                      name="blurBackground"
                      checked={formData.blurBackground}
                      onChange={handleChange}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'audio' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">Audio Settings</h2>
                
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">
                    <div>
                      <span className="block font-medium text-slate-800">Mute my microphone when joining a meeting</span>
                      <span className="block text-sm text-slate-500">Automatically silence your mic when entering a room</span>
                    </div>
                    <input 
                      type="checkbox" 
                      name="micEnabled"
                      checked={!formData.micEnabled}
                      onChange={(e) => setFormData(prev => ({...prev, micEnabled: !e.target.checked}))}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-end gap-4">
            {saveSuccess && (
              <span className="text-green-600 text-sm font-medium">Settings saved successfully!</span>
            )}
            <button 
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
