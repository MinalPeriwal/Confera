import Link from "next/link";
import { Video, Calendar, Shield, Users, MonitorPlay, MessageSquare, ChevronRight, Menu } from "lucide-react";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

export default async function LandingPage() {
  const { userId } = await auth();
  
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Video className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-xl text-slate-900 tracking-tight">Confera</span>
              </Link>
              
              <nav className="hidden md:flex space-x-8">
                <Link href="/" className="text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors">Products</Link>
                <Link href="/" className="text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors">Solutions</Link>
                <Link href="/" className="text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors">Resources</Link>
                <Link href="/" className="text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors">Pricing</Link>
              </nav>
            </div>

            <div className="hidden md:flex items-center gap-4">
              {!userId ? (
                <>
                  <SignInButton mode="modal">
                    <button className="text-slate-600 hover:text-blue-600 font-medium text-sm transition-colors">
                      Sign In
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:shadow-lg hover:shadow-blue-600/20 active:scale-95">
                      Get Started
                    </button>
                  </SignUpButton>
                </>
              ) : (
                <>
                  <Link href="/dashboard" className="text-slate-600 hover:text-blue-600 font-medium text-sm transition-colors mr-2">
                    Dashboard
                  </Link>
                  <UserButton />
                </>
              )}
            </div>
            
            <button className="md:hidden text-slate-600">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden bg-white pt-20 pb-32">
          {/* Background decorative elements */}
          <div className="absolute top-0 right-0 -translate-y-12 translate-x-1/3">
            <div className="w-96 h-96 bg-blue-100/50 rounded-full blur-3xl" />
          </div>
          <div className="absolute bottom-0 left-0 translate-y-1/3 -translate-x-1/3">
            <div className="w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight mb-8 leading-tight">
              One platform to <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                connect your team
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-xl text-slate-600 mx-auto mb-10 leading-relaxed">
              Bring your team together, wherever they are. Professional HD video, 
              crystal clear audio, and seamless collaboration built for the modern workforce.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/dashboard" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-full text-lg font-medium transition-all hover:shadow-xl hover:shadow-blue-600/30 flex items-center justify-center gap-2 group">
                <Video className="w-5 h-5" />
                New Meeting
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/dashboard" className="w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-8 py-4 rounded-full text-lg font-medium transition-all hover:shadow-md flex items-center justify-center gap-2">
                Join Meeting
              </Link>
            </div>
            <p className="mt-6 text-sm text-slate-500">Free forever. No credit card required.</p>
            
            {/* Hero Image Mockup */}
            <div className="mt-20 max-w-5xl mx-auto relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200/50 bg-slate-900 aspect-video flex items-center justify-center">
               <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
               <div className="relative text-center">
                 <Video className="w-20 h-20 text-blue-500 mx-auto mb-6 opacity-80" />
                 <h3 className="text-2xl font-medium text-white mb-2">High Quality Video Conferencing</h3>
                 <p className="text-slate-400">Join instantly from any device</p>
               </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900">Everything you need for perfect meetings</h2>
              <p className="mt-4 text-lg text-slate-600">Built for performance, reliability, and ease of use.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                  <Video className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">HD Video & Audio</h3>
                <p className="text-slate-600 leading-relaxed">
                  Experience crystal clear 1080p video and background noise suppression for distraction-free meetings.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-6">
                  <MonitorPlay className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Screen Sharing</h3>
                <p className="text-slate-600 leading-relaxed">
                  Share your entire screen, a specific window, or a tab with uncompromised quality and frame rates.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-6">
                  <Shield className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Secure by Design</h3>
                <p className="text-slate-600 leading-relaxed">
                  End-to-end encryption ensures your meetings stay private. Wait rooms and host controls included.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                  <MessageSquare className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Real-time Chat</h3>
                <p className="text-slate-600 leading-relaxed">
                  Share links, files, and messages instantly with all participants or in private 1-on-1 channels.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center mb-6">
                  <Calendar className="w-6 h-6 text-rose-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Easy Scheduling</h3>
                <p className="text-slate-600 leading-relaxed">
                  Generate unique meeting IDs instantly or schedule in advance with automatic calendar invites.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-6">
                  <Users className="w-6 h-6 text-amber-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Large Gatherings</h3>
                <p className="text-slate-600 leading-relaxed">
                  Host up to 100 interactive video participants seamlessly with dynamic grid layouts.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Video className="w-5 h-5 text-blue-600" />
              <span className="font-bold text-lg text-slate-900">Confera</span>
            </div>
            <p className="text-slate-500 text-sm">
              © {new Date().getFullYear()} Confera Inc. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link href="/" className="text-slate-400 hover:text-slate-600 transition-colors">Privacy</Link>
              <Link href="/" className="text-slate-400 hover:text-slate-600 transition-colors">Terms</Link>
              <Link href="/" className="text-slate-400 hover:text-slate-600 transition-colors">Status</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
