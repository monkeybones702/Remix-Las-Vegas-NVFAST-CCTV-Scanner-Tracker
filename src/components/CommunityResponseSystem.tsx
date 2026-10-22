import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  MessageSquarePlus,
  Send,
  ThumbsUp,
  AlertTriangle,
  Radio,
  Clock,
  MapPin,
  Camera as CameraIcon,
  Shield,
  CheckCircle2,
  Filter,
  Flame,
  Car,
  Eye,
  ArrowRight,
  Sparkles,
  Users,
  Compass
} from 'lucide-react';
import type { Camera, CommunityPost, CommunityResponse, CADIncident } from '../types';

interface CommunityResponseSystemProps {
  cameras: Camera[];
  onSelectCamera: (camera: Camera) => void;
  preselectedCamera?: Camera | null;
  onClosePreselected?: () => void;
}

export const CommunityResponseSystem: React.FC<CommunityResponseSystemProps> = ({
  cameras,
  onSelectCamera,
  preselectedCamera,
  onClosePreselected
}) => {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [cadIncidents, setCadIncidents] = useState<CADIncident[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'cad'>('feed');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [replyingToPostId, setReplyingToPostId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<string>('');
  const [replyStatusUpdate, setReplyStatusUpdate] = useState<'active' | 'updating' | 'cleared'>('updating');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // New Post Form state
  const [newTitle, setNewTitle] = useState<string>('');
  const [newContent, setNewContent] = useState<string>('');
  const [newCategory, setNewCategory] = useState<CommunityPost['category']>('incident');
  const [newAuthorRole, setNewAuthorRole] = useState<CommunityPost['authorRole']>('spotter');
  const [newAuthorName, setNewAuthorName] = useState<string>('VegasSpotter702');
  const [selectedCameraId, setSelectedCameraId] = useState<number | undefined>(
    preselectedCamera ? preselectedCamera.id : 21603
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // 1. Fetch posts
  const loadPosts = () => {
    fetch('/api/posts')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.posts) {
          setPosts(data.posts);
        }
      })
      .catch((err) => console.error('Failed to load community posts:', err));
  };

  // 2. Fetch CAD incidents
  const loadCADIncidents = () => {
    fetch('/api/cad/incidents')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.incidents) {
          setCadIncidents(data.incidents);
        }
      })
      .catch((err) => console.error('Failed to load CAD incidents:', err));
  };

  useEffect(() => {
    loadPosts();
    loadCADIncidents();
    const interval = setInterval(() => {
      loadPosts();
      loadCADIncidents();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update selected camera if preselectedCamera changes
  useEffect(() => {
    if (preselectedCamera) {
      setSelectedCameraId(preselectedCamera.id);
      setIsCreateModalOpen(true);
    }
  }, [preselectedCamera]);

  // Submit new post
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      showToast('Please enter both a title and details.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: newAuthorName,
          authorRole: newAuthorRole,
          category: newCategory,
          title: newTitle,
          content: newContent,
          cameraId: selectedCameraId
        })
      });
      const data = await res.json();
      if (data && data.post) {
        setPosts((prev) => [data.post, ...prev]);
        setIsCreateModalOpen(false);
        setNewTitle('');
        setNewContent('');
        showToast('Community incident report published successfully!');
        if (onClosePreselected) onClosePreselected();
      }
    } catch {
      showToast('Failed to publish report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit reply to a post
  const handleSendReply = async (postId: string) => {
    if (!replyContent.trim()) return;

    try {
      const res = await fetch(`/api/posts/${postId}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: newAuthorName || 'Local Driver',
          authorBadge: newAuthorRole === 'verified_responder' ? 'Verified Responder' : 'Local Spotter',
          content: replyContent,
          statusUpdate: replyStatusUpdate
        })
      });
      const data = await res.json();
      if (data && data.post) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? data.post : p)));
        setReplyContent('');
        setReplyingToPostId(null);
        showToast('Response & status update posted!');
      }
    } catch {
      showToast('Failed to post reply.');
    }
  };

  // Upvote / confirm report
  const handleUpvote = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}/upvote`, { method: 'POST' });
      const data = await res.json();
      if (data && typeof data.upvotes === 'number') {
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, upvotes: data.upvotes, hasUpvoted: true } : p))
        );
        showToast('Confirmed report veracity (+1)');
      }
    } catch {
      showToast('Action failed.');
    }
  };

  const filteredPosts = posts.filter((p) => {
    if (categoryFilter === 'all') return true;
    return p.category === categoryFilter;
  });

  const getCategoryBadge = (cat: CommunityPost['category']) => {
    switch (cat) {
      case 'incident':
        return <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px] font-bold uppercase">Incident</span>;
      case 'hazard':
        return <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px] font-bold uppercase">Hazard</span>;
      case 'operator_activity':
        return <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-bold uppercase flex items-center gap-1"><Compass className="w-2.5 h-2.5" /> Operator Motion</span>;
      case 'congestion':
        return <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[10px] font-bold uppercase">Congestion</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold uppercase">General</span>;
    }
  };

  const getRoleBadge = (role: CommunityPost['authorRole']) => {
    switch (role) {
      case 'verified_responder':
        return <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px]">Verified Responder</span>;
      case 'spotter':
        return <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px]">CCTV Spotter</span>;
      case 'driver':
        return <span className="px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[10px]">Local Driver</span>;
      default:
        return <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[10px]">Resident</span>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Main Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Users className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-white tracking-wide">
                Community Response &amp; Incident Posting System
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Real-time user crowdsourced traffic logs, CCTV PTZ operator observations, hazard alerts,
              and coordinated spotter responses across Las Vegas corridors.
            </p>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm rounded-lg shadow-md transition-all flex-shrink-0"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>Create Incident Report</span>
          </button>
        </div>

        {/* Mode switcher tabs */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('feed')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'feed'
                ? 'bg-slate-800 text-amber-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Community Posts &amp; Responses ({posts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('cad')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'cad'
                ? 'bg-slate-800 text-amber-400 border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-rose-400" />
            <span>CAD Dispatch Activity Relay ({cadIncidents.length})</span>
          </button>
        </div>
      </div>

      {/* CAD Dispatch Activity Tab View */}
      {activeTab === 'cad' && (
        <div className="space-y-3">
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Public Safety &amp; Traffic Incident CAD Stream (LVMPD, CCFD, NDOT TIM)</span>
            </span>
            <span className="text-slate-500 text-[11px]">Synced with nearest NV FAST camera nodes</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {cadIncidents.map((cad) => {
              const cam = cameras.find((c) => c.id === cad.nearestCameraId);
              return (
                <div
                  key={cad.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-rose-400 font-bold">{cad.agencyLabel}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px]">
                        {cad.id}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white leading-tight">{cad.callType}</h3>
                    <p className="text-xs text-slate-300 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span>{cad.location}</span>
                    </p>

                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850 text-xs text-slate-300">
                      <p>{cad.details}</p>
                      <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                        <span>Units: {cad.unitsDispatched.join(', ')}</span>
                        <span className="uppercase text-emerald-400 font-semibold">{cad.status.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>

                  {cam && (
                    <button
                      onClick={() => onSelectCamera(cam)}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <CameraIcon className="w-3.5 h-3.5 text-amber-400" />
                      <span>Inspect Nearest CCTV #{cam.id}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Community Posts & Responses Feed Tab View */}
      {activeTab === 'feed' && (
        <div className="space-y-4">
          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              All Reports ({posts.length})
            </button>
            <button
              onClick={() => setCategoryFilter('operator_activity')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                categoryFilter === 'operator_activity'
                  ? 'bg-purple-600 text-white font-bold'
                  : 'bg-slate-900 border border-slate-800 text-purple-300 hover:bg-slate-800'
              }`}
            >
              <Compass className="w-3 h-3" />
              Operator PTZ Actions
            </button>
            <button
              onClick={() => setCategoryFilter('incident')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                categoryFilter === 'incident'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'bg-slate-900 border border-slate-800 text-rose-300 hover:bg-slate-800'
              }`}
            >
              Traffic Incidents
            </button>
            <button
              onClick={() => setCategoryFilter('hazard')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                categoryFilter === 'hazard'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-slate-900 border border-slate-800 text-amber-300 hover:bg-slate-800'
              }`}
            >
              Road Hazards
            </button>
            <button
              onClick={() => setCategoryFilter('congestion')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                categoryFilter === 'congestion'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-900 border border-slate-800 text-blue-300 hover:bg-slate-800'
              }`}
            >
              Congestion &amp; Pedestrians
            </button>
          </div>

          {/* Posts List */}
          <div className="space-y-3.5">
            {filteredPosts.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-400">
                <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-200">No community posts in this category</p>
                <p className="text-xs text-slate-500 mt-1">
                  Be the first to post a road hazard, incident note, or CCTV camera observation!
                </p>
              </div>
            ) : (
              filteredPosts.map((post) => {
                const targetCam = post.cameraId ? cameras.find((c) => c.id === post.cameraId) : null;
                const isReplying = replyingToPostId === post.id;

                return (
                  <div
                    key={post.id}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-3 transition-colors hover:border-slate-700"
                  >
                    {/* Post Author & Category Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white">{post.author}</span>
                        {getRoleBadge(post.authorRole)}
                        {getCategoryBadge(post.category)}
                        {post.status === 'cleared' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-semibold border border-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Resolved / Cleared
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 text-[10px] font-semibold border border-amber-800 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Active Situation
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>
                          {new Date(post.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Post Content */}
                    <div className="space-y-1.5">
                      <h3 className="text-base font-bold text-slate-100">{post.title}</h3>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{post.content}</p>
                    </div>

                    {/* Attached Camera Snapshot & Link (if attached) */}
                    {post.cameraId && (
                      <div className="bg-slate-950 rounded-lg p-2.5 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={post.snapshotUrl || `/api/camera-snapshot/${post.cameraId}`}
                            alt={post.cameraName || 'CCTV'}
                            className="w-20 h-14 object-cover rounded border border-slate-700 bg-slate-900 flex-shrink-0"
                            loading="lazy"
                          />
                          <div className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-amber-400 font-semibold">CCTV #{post.cameraId}</span>
                              <span className="text-slate-400">• {post.corridor}</span>
                            </div>
                            <div className="text-white font-semibold mt-0.5 truncate max-w-xs sm:max-w-sm">
                              {post.cameraName}
                            </div>
                          </div>
                        </div>

                        {targetCam && (
                          <button
                            onClick={() => onSelectCamera(targetCam)}
                            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors flex-shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-400" />
                            <span>Inspect Live Feed</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Action footer: Upvote, Reply toggle, Responses count */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {/* Confirm / Upvote Button */}
                        <button
                          onClick={() => handleUpvote(post.id)}
                          className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 font-medium transition-colors ${
                            post.hasUpvoted
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                          }`}
                        >
                          <ThumbsUp className="w-3 h-3 text-amber-400" />
                          <span>Confirm Report ({post.upvotes})</span>
                        </button>

                        <button
                          onClick={() => setReplyingToPostId(isReplying ? null : post.id)}
                          className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors font-medium"
                        >
                          <MessageSquare className="w-3 h-3 text-slate-400" />
                          <span>Respond ({post.responses.length})</span>
                        </button>
                      </div>

                      <div className="text-[11px] text-slate-400">
                        {post.responses.length > 0 && (
                          <span>
                            Latest update {new Date(post.responses[post.responses.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Threaded Responses Section */}
                    {post.responses.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-800/60 space-y-2.5 pl-2 sm:pl-4 border-l-2 border-slate-700/60">
                        {post.responses.map((resp) => (
                          <div key={resp.id} className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/60 text-xs space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-200">{resp.author}</span>
                                {resp.authorBadge && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                                    {resp.authorBadge}
                                  </span>
                                )}
                                {resp.statusUpdate === 'cleared' && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                                    Marked Resolved
                                  </span>
                                )}
                              </div>
                              <span>
                                {new Date(resp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-slate-200 leading-normal">{resp.content}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Inline Reply Input Form */}
                    {isReplying && (
                      <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          placeholder="Post response or update (e.g. 'Tow truck on scene', 'Lane reopened')..."
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSendReply(post.id);
                          }}
                          className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />

                        <select
                          value={replyStatusUpdate}
                          onChange={(e) => setReplyStatusUpdate(e.target.value as any)}
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-300 focus:outline-none"
                        >
                          <option value="updating">Status: Ongoing Update</option>
                          <option value="cleared">Status: Resolved / Cleared</option>
                        </select>

                        <button
                          onClick={() => handleSendReply(post.id)}
                          className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Reply</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Create Incident Report Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg p-5 text-slate-100 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded bg-amber-500/20 text-amber-400">
                  <MessageSquarePlus className="w-5 h-5" />
                </span>
                <h3 className="text-base font-bold text-white">Create Incident / CCTV Report</h3>
              </div>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  if (onClosePreselected) onClosePreselected();
                }}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-3.5 text-xs">
              {/* Author and Role row */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">Your Alias</label>
                  <input
                    type="text"
                    value={newAuthorName}
                    onChange={(e) => setNewAuthorName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    placeholder="e.g. VegasSpotter"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Role / Badge</label>
                  <select
                    value={newAuthorRole}
                    onChange={(e) => setNewAuthorRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="spotter">CCTV Spotter</option>
                    <option value="driver">Local Driver</option>
                    <option value="resident">Resident</option>
                    <option value="verified_responder">Verified Responder</option>
                  </select>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-slate-400 mb-1">Report Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="incident">Traffic Incident (Accident, collision, blocked lane)</option>
                  <option value="operator_activity">Live Operator Activity (PTZ slewing/zooming observed)</option>
                  <option value="hazard">Road Hazard (Debris, tire tread, stall, construction)</option>
                  <option value="congestion">Congestion / Foot Traffic Surge</option>
                  <option value="general">General Advisory</option>
                </select>
              </div>

              {/* Associated Camera Picker */}
              <div>
                <label className="block text-slate-400 mb-1">Attach CCTV Camera Node</label>
                <select
                  value={selectedCameraId || ''}
                  onChange={(e) => setSelectedCameraId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                >
                  <option value="">-- No camera attached --</option>
                  {cameras.slice(0, 150).map((c) => (
                    <option key={c.id} value={c.id}>
                      CCTV #{c.id} - {c.name} ({c.corridor})
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-slate-400 mb-1">Summary Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  placeholder="e.g. Center lane blocked by stalled pickup truck"
                  required
                />
              </div>

              {/* Description Content */}
              <div>
                <label className="block text-slate-400 mb-1">Incident Details &amp; Observations</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500 resize-none"
                  placeholder="Provide context on lane blockages, emergency vehicles present, camera PTZ adjustments, or vehicle descriptions..."
                  required
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg shadow disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Publishing...' : 'Publish Report'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Internal Toast */}
      {toastMsg && (
        <div className="fixed bottom-4 left-4 z-50 bg-slate-900 border border-amber-500/80 text-amber-200 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-medium animate-in slide-in-from-bottom-3 duration-150">
          <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
