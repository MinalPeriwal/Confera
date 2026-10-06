"use client";

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { User, Camera, Mic, Shield, Loader2, ExternalLink } from "lucide-react";
import { useUser, useClerk } from "@clerk/nextjs";
import { readPrefs, writePrefs } from "@/lib/prefs";

type Tab = "profile" | "video" | "audio" | "security";

function CameraPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: true })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  if (error) {
    return (
      <div className="bg-slate-900 rounded-xl aspect-video flex flex-col items-center justify-center text-red-400 mb-6 border border-slate-800">
        <Camera className="w-10 h-10 mb-2 opacity-50" />
        <span className="text-sm">Camera unavailable or access denied</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-xl aspect-video flex items-center justify-center text-slate-500 mb-6 overflow-hidden relative">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
      <div className="absolute bottom-3 left-3 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">Live preview</div>
    </div>
  );
}

function Switch({ label, hint, checked, onChange, testId }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <label className="flex items-center justify-between gap-4 p-4 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">
      <div>
        <span className="block font-medium text-slate-800">{label}</span>
        <span className="block text-sm text-slate-500">{hint}</span>
      </div>
      <input type="checkbox" data-testid={testId} checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 accent-blue-600 flex-shrink-0" />
    </label>
  );
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [prefs, setPrefs] = useState({ joinCameraOff: false, joinMuted: false, blur: false });

  // Load saved preferences (browser-only) once
  useEffect(() => {
    const saved = readPrefs();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser storage
    setPrefs({ joinCameraOff: !!saved.joinCameraOff, joinMuted: !!saved.joinMuted, blur: !!saved.blur });
  }, []);

  // Fill the name field once the account has loaded
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise the form from the loaded account
    if (user) setDisplayName(user.fullName || user.username || "");
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      writePrefs(prefs);
      const name = displayName.trim();
      if (user && name && name !== (user.fullName || "")) {
        const [firstName, ...rest] = name.split(/\s+/);
        await user.update({ firstName, lastName: rest.join(" ") });
      }
      toast.success("Settings saved");
    } catch {
      toast.error("Could not update your profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePicture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast.error("Choose an image smaller than 5 MB");
      return;
    }
    setUploading(true);
    try {
      await user.setProfileImage({ file });
      toast.success("Profile picture updated");
    } catch {
      toast.error("Could not upload the picture");
    } finally {
      setUploading(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "video", label: "Video", icon: Camera },
    { id: "audio", label: "Audio", icon: Mic },
    { id: "security", label: "Security", icon: Shield },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[70vh]">
      <div className="w-full md:w-64 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-4 md:p-6 flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-800 mb-4 md:mb-6">Settings</h1>
        <nav className="flex md:flex-col gap-1 overflow-x-auto" aria-label="Settings sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              data-testid={`tab-${id}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === id ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 p-6 md:p-10">
        <form onSubmit={handleSave} className="max-w-2xl">
          {activeTab === "profile" && (
            <div>
              <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">Profile</h2>
              <div className="flex items-center gap-6 mb-8">
                {user?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- remote avatar from the sign-in provider
                  <img src={user.imageUrl} alt="Your profile" className="w-24 h-24 rounded-2xl object-cover shadow-sm" />
                ) : (
                  <div className="w-24 h-24 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-sm">
                    {(displayName || "U").charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePicture} data-testid="picture-input" />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || !isLoaded}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {uploading && <Loader2 className="w-4 h-4 animate-spin" />} Change picture
                  </button>
                  <p className="text-xs text-slate-500 mt-2">JPG or PNG, up to 5 MB.</p>
                </div>
              </div>

              <div className="grid gap-6">
                <div>
                  <label htmlFor="display-name" className="block text-sm font-medium text-slate-700 mb-1">Display name</label>
                  <input
                    id="display-name"
                    type="text"
                    value={displayName}
                    maxLength={60}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
                  <input
                    id="email"
                    type="email"
                    value={user?.primaryEmailAddress?.emailAddress ?? ""}
                    disabled
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">Manage your email under the Security tab.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "video" && (
            <div>
              <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">Video</h2>
              <CameraPreview />
              <div className="space-y-4">
                <Switch
                  testId="pref-camera-off"
                  label="Turn off my video when joining"
                  hint="Your camera starts off in every meeting you join on this device."
                  checked={prefs.joinCameraOff}
                  onChange={(v) => setPrefs(p => ({ ...p, joinCameraOff: v }))}
                />
                <Switch
                  testId="pref-blur"
                  label="Blur my background"
                  hint="Applied automatically when your camera starts. You can also toggle it inside a meeting."
                  checked={prefs.blur}
                  onChange={(v) => setPrefs(p => ({ ...p, blur: v }))}
                />
              </div>
              <p className="text-sm text-slate-500 mt-4">Pick a different camera in the join screen, or during a meeting under More → Audio &amp; video settings.</p>
            </div>
          )}

          {activeTab === "audio" && (
            <div>
              <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">Audio</h2>
              <Switch
                testId="pref-muted"
                label="Mute my microphone when joining"
                hint="Your microphone starts muted in every meeting you join on this device."
                checked={prefs.joinMuted}
                onChange={(v) => setPrefs(p => ({ ...p, joinMuted: v }))}
              />
              <p className="text-sm text-slate-500 mt-4">Choose your microphone and speaker in the join screen, or during a meeting under More → Audio &amp; video settings.</p>
            </div>
          )}

          {activeTab === "security" && (
            <div>
              <h2 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 mb-6">Account security</h2>
              <p className="text-slate-600 mb-5">Change your password, email address and connected accounts, or sign out of other devices.</p>
              <button
                type="button"
                onClick={() => clerk.openUserProfile()}
                data-testid="open-account"
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-colors inline-flex items-center gap-2"
              >
                Manage account <ExternalLink className="w-4 h-4" />
              </button>
              <p className="text-sm text-slate-500 mt-6">Meeting-level security (waiting room, passcode, lock) is set when you create a meeting and from the Participants panel in a call.</p>
            </div>
          )}

          {activeTab !== "security" && (
            <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-end">
              <button
                type="submit"
                disabled={isSaving}
                data-testid="save-settings"
                className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
