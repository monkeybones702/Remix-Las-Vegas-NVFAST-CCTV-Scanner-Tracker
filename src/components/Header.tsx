import React from 'react';
import { Camera, Radio, Search, Navigation, MapPin, Sparkles, RefreshCw, Eye, Compass, Users, Flame, Code, Clock, LogIn, LogOut, Cloud, Bell, BellRing } from 'lucide-react';
import type { User } from '../firebase';

export type NavTabType = 'monitor' | 'ptz' | 'radar' | 'community' | 'search' | 'tracker' | 'map';

interface HeaderProps {
  activeTab: NavTabType;
  setActiveTab: (tab: NavTabType) => void;
  refreshRate: number;
  setRefreshRate: (rate: number) => void;
  isPaused: boolean;
  setIsPaused: (paused: boolean) => void;
  lastRefreshTime: Date;
  trackedCount: number;
  movingCount?: number;
  postsCount?: number;
  correlationCount?: number;
  newsCount?: number;
  onQuickScanCorridor: () => void;
  isScanningCorridor: boolean;
  onRefreshAllIncidents?: () => void;
  isRefreshingIncidents?: boolean;
  onOpenSourceCode?: () => void;
  onOpenFovAlerts?: () => void;
  unacknowledgedFovAlertCount?: number;
  currentUser?: User | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  cloudSavedCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  refreshRate,
  setRefreshRate,
  isPaused,
  setIsPaused,
  lastRefreshTime,
  trackedCount,
  movingCount = 0,
  postsCount = 0,
  correlationCount = 4,
  newsCount = 6,
  onQuickScanCorridor,
  isScanningCorridor,
  onRefreshAllIncidents,
  isRefreshingIncidents = false,
  onOpenSourceCode,
  onOpenFovAlerts,
  unacknowledgedFovAlertCount = 0,
  currentUser,
  onSignIn,
  onSignOut,
  cloudSavedCount = 0
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-40 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Logo & Node connection info */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-md shadow-red-900/30 flex-shrink-0">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  NV FAST CCTV Network
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    bugatti.nvfast.org
                  </span>
                </h1>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>1,238 Las Vegas Traffic Cameras</span>
                <span>•</span>
                <span className="text-slate-300">Live Snapshots & Trajectory Scanner</span>
              </p>
            </div>
          </div>

          {/* Quick Stats & Controls */}
          <div className="flex items-center flex-wrap gap-2 text-xs">
            {/* Auto refresh dropdown */}
            <div className="flex items-center bg-slate-800 rounded-md border border-slate-700 px-2 py-1 gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${!isPaused ? 'animate-spin-slow' : ''}`} />
              <span className="text-slate-400">Stream:</span>
              <select
                value={isPaused ? 'paused' : refreshRate}
                onChange={(e) => {
                  if (e.target.value === 'paused') {
                    setIsPaused(true);
                  } else {
                    setIsPaused(false);
                    setRefreshRate(Number(e.target.value));
                  }
                }}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-medium"
              >
                <option value={1000} className="bg-slate-800">1s High-rate</option>
                <option value={2000} className="bg-slate-800">2s Live</option>
                <option value={5000} className="bg-slate-800">5s Standard</option>
                <option value={10000} className="bg-slate-800">10s Low Bandwidth</option>
                <option value="paused" className="bg-slate-800">Paused</option>
              </select>
            </div>

            {/* AI Corridor Scan Trigger */}
            <button
              onClick={onQuickScanCorridor}
              disabled={isScanningCorridor}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold rounded-md shadow-sm transition-all disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isScanningCorridor ? 'Scanning CCTV...' : 'AI Corridor Scan'}</span>
            </button>

            {/* Update All Incidents Trigger */}
            {onRefreshAllIncidents && (
              <button
                onClick={onRefreshAllIncidents}
                disabled={isRefreshingIncidents}
                title="Update all incidents across News, Radio Scanners, FixIt 311, and Social Feeds. Default sorted by timestamp."
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-slate-700 rounded-md font-medium transition-all text-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingIncidents ? 'animate-spin text-amber-400' : ''}`} />
                <span>{isRefreshingIncidents ? 'Syncing...' : 'Update All Incidents'}</span>
              </button>
            )}

            {/* High-Traffic Camera FOV Alerts Trigger */}
            {onOpenFovAlerts && (
              <button
                onClick={onOpenFovAlerts}
                title="High-Traffic Camera Field-of-View (FOV) Entry Alerts"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors text-xs whitespace-nowrap border ${
                  unacknowledgedFovAlertCount > 0
                    ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/50'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {unacknowledgedFovAlertCount > 0 ? (
                  <BellRing className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                ) : (
                  <Bell className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>FOV Alerts</span>
                <span className="font-mono tabular-nums">({unacknowledgedFovAlertCount})</span>
              </button>
            )}

            {/* Source Code Modal Trigger */}
            {onOpenSourceCode && (
              <button
                onClick={onOpenSourceCode}
                title="Inspect Page Source Code & Data Origin Links"
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-md font-medium transition-all text-xs"
              >
                <Code className="w-3.5 h-3.5 text-amber-400" />
                <span>Source Code</span>
              </button>
            )}

            {/* Firebase Auth Google Sign-In / User Profile */}
            {currentUser ? (
              <div className="flex items-center gap-2 bg-slate-800/90 border border-emerald-800/60 rounded-md px-2.5 py-1">
                <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-200 font-medium truncate max-w-[120px]" title={currentUser.email || 'Operator'}>
                  {currentUser.displayName || currentUser.email || 'Operator'}
                </span>
                <span className="text-slate-500" aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-emerald-400">{cloudSavedCount} saved</span>
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    title="Sign out of Firebase Cloud Sync"
                    className="ml-1 text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              onSignIn && (
                <button
                  onClick={onSignIn}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-md transition-colors text-xs whitespace-nowrap"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Google Sign-In</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-t border-slate-800/80 mt-3 pt-2 overflow-x-auto">
          <nav className="flex space-x-1 sm:space-x-2" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('monitor')}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'monitor'
                  ? 'bg-slate-800 text-amber-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Live CCTV Matrix</span>
            </button>

            <button
              onClick={() => setActiveTab('ptz')}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'ptz'
                  ? 'bg-slate-800 text-rose-300 border border-rose-800/80'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Compass className="w-4 h-4 text-rose-400" />
              <span>PTZ Motion Scanner</span>
              {movingCount > 0 && (
                <span className="px-1.5 py-0.2 bg-rose-500 text-white font-bold rounded-full text-[10px] animate-pulse">
                  {movingCount} Live
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('radar')}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'radar'
                  ? 'bg-slate-800 text-amber-300 border border-amber-500/80 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Crime Radar & News</span>
              {(correlationCount > 0 || newsCount > 0) && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold rounded-full text-[10px]">
                  {correlationCount + newsCount} Live
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('community')}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'community'
                  ? 'bg-slate-800 text-amber-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Users className="w-4 h-4 text-amber-400" />
              <span>Community Response</span>
              {postsCount > 0 && (
                <span className="px-1.5 py-0.2 bg-slate-700 text-amber-300 font-semibold rounded-full text-[10px]">
                  {postsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('search')}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'search'
                  ? 'bg-slate-800 text-amber-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Attribute Scanner & Search</span>
            </button>

            <button
              onClick={() => setActiveTab('tracker')}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'tracker'
                  ? 'bg-slate-800 text-amber-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Navigation className="w-4 h-4" />
              <span>Target Tracker</span>
              {trackedCount > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold rounded-full text-[10px]">
                  {trackedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('map')}
              className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                activeTab === 'map'
                  ? 'bg-slate-800 text-amber-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>Las Vegas Map</span>
            </button>
          </nav>

          <div className="hidden sm:flex items-center text-[11px] text-slate-400 gap-2">
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/90 text-[10px] text-amber-300 border border-slate-700 font-mono">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>Default: Timestamp (Newest First)</span>
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3 text-slate-500" />
              Sync: {lastRefreshTime.toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
