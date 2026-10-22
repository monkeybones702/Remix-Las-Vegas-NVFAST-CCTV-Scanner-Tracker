import React, { useState, useEffect, useMemo } from 'react';
import {
  Radio,
  FileText,
  Share2,
  GitMerge,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  Volume2,
  VolumeX,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Shield,
  MapPin,
  Camera,
  Play,
  Pause,
  CheckCircle2,
  ThumbsUp,
  MessageSquare,
  Flame,
  Layers,
  Compass,
  Building,
  Wrench,
  ChevronRight,
  TrendingUp,
  Video,
  Send,
  Newspaper,
  ArrowUpDown,
  Globe,
  Tv,
  BellRing
} from 'lucide-react';
import type {
  Camera as CameraType,
  ScannerFeed,
  ScannerTranscript,
  FixItReport,
  FixItCategory,
  SocialPost,
  SocialPlatform,
  CrossCorrelationEvent,
  NewsChannelItem
} from '../types';

interface CrimeRadarIntelligenceProps {
  cameras: CameraType[];
  onSelectCamera: (camera: CameraType) => void;
  liveTimestamp: number;
}

export const CrimeRadarIntelligence: React.FC<CrimeRadarIntelligenceProps> = ({
  cameras,
  onSelectCamera,
  liveTimestamp
}) => {
  // Main sub-navigation tab inside the intelligence hub (default to all_incidents or news)
  const [activeIntelTab, setActiveIntelTab] = useState<'all_incidents' | 'news' | 'correlation' | 'scanner' | 'fixit' | 'social'>('all_incidents');

  // Default sorting by timestamp descending (newest first)
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Data states
  const [newsItems, setNewsItems] = useState<NewsChannelItem[]>([]);
  const [scannerFeeds, setScannerFeeds] = useState<ScannerFeed[]>([]);
  const [transcripts, setTranscripts] = useState<ScannerTranscript[]>([]);
  const [fixItReports, setFixItReports] = useState<FixItReport[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);
  const [correlationEvents, setCorrelationEvents] = useState<CrossCorrelationEvent[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNewsChannel, setSelectedNewsChannel] = useState<string>('all');
  const [selectedFeedId, setSelectedFeedId] = useState<string>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedFixItStatus, setSelectedFixItStatus] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');

  // Status & action states
  const [isScanningNews, setIsScanningNews] = useState(false);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [playingFeedId, setPlayingFeedId] = useState<string | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [aiSynthesisResult, setAiSynthesisResult] = useState<any | null>(null);

  // New FixIt Report form modal/drawer
  const [showNewFixItModal, setShowNewFixItModal] = useState(false);
  const [newFixItTitle, setNewFixItTitle] = useState('');
  const [newFixItDescription, setNewFixItDescription] = useState('');
  const [newFixItCategory, setNewFixItCategory] = useState<FixItCategory>('roadway_hazard_debris');
  const [newFixItCameraId, setNewFixItCameraId] = useState<number>(21603);
  const [isSubmittingFixIt, setIsSubmittingFixIt] = useState(false);

  // New Radio Intercept simulation
  const [isSimulatingAudio, setIsSimulatingAudio] = useState(false);

  // 1. Fetch all datasets (News, Scanners, FixIt, Social, Correlation)
  const fetchAllData = () => {
    fetch('/api/news/scan')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.news) setNewsItems(data.news);
      })
      .catch(() => {});

    fetch('/api/scanner/feeds')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.feeds) setScannerFeeds(data.feeds);
      })
      .catch(() => {});

    fetch('/api/scanner/transcripts')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.transcripts) setTranscripts(data.transcripts);
      })
      .catch(() => {});

    fetch('/api/fixit/reports')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.reports) setFixItReports(data.reports);
      })
      .catch(() => {});

    fetch('/api/social/posts')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.posts) setSocialPosts(data.posts);
      })
      .catch(() => {});

    fetch('/api/correlation/events')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.events) setCorrelationEvents(data.events);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handler: Scan all major news channels
  const handleScanNewsChannels = async () => {
    setIsScanningNews(true);
    try {
      const res = await fetch('/api/news/scan', { method: 'POST' });
      const data = await res.json();
      if (data && data.news) {
        setNewsItems(data.news);
      }
    } catch (err) {
      console.error('Failed to scan news channels:', err);
    } finally {
      setIsScanningNews(false);
    }
  };

  // Handler: Update all incidents across all channels
  const handleUpdateAllIncidents = async () => {
    setIsUpdatingAll(true);
    try {
      const res = await fetch('/api/incidents/refresh', { method: 'POST' });
      const data = await res.json();
      if (data && data.success) {
        if (data.news) setNewsItems(data.news);
        if (data.correlationEvents) setCorrelationEvents(data.correlationEvents);
        if (data.transcripts) setTranscripts(data.transcripts);
        if (data.reports) setFixItReports(data.reports);
        if (data.social) setSocialPosts(data.social);
      }
    } catch (err) {
      console.error('Failed to update incidents:', err);
    } finally {
      setIsUpdatingAll(false);
    }
  };

  // Audio simulation toggle
  const togglePlayFeed = (feedId: string) => {
    if (playingFeedId === feedId) {
      setPlayingFeedId(null);
    } else {
      setPlayingFeedId(feedId);
    }
  };

  // Run AI Synthesis
  const handleRunAiSynthesis = async (cameraId?: number, keyword?: string) => {
    setIsSynthesizing(true);
    setAiSynthesisResult(null);
    try {
      const res = await fetch('/api/correlation/ai-synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId, incidentKeyword: keyword })
      });
      const data = await res.json();
      if (data && data.synthesis) {
        setAiSynthesisResult(data.synthesis);
      }
    } catch (err) {
      console.error('Synthesis failed:', err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Submit new FixIt ticket
  const handleSubmitFixIt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFixItTitle.trim() || !newFixItDescription.trim()) return;

    setIsSubmittingFixIt(true);
    try {
      const res = await fetch('/api/fixit/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newFixItTitle,
          description: newFixItDescription,
          category: newFixItCategory,
          cameraId: newFixItCameraId
        })
      });
      const data = await res.json();
      if (data.success && data.report) {
        setFixItReports((prev) => [data.report, ...prev]);
        setShowNewFixItModal(false);
        setNewFixItTitle('');
        setNewFixItDescription('');
      }
    } catch (err) {
      console.error('Failed to submit FixIt report:', err);
    } finally {
      setIsSubmittingFixIt(false);
    }
  };

  // Simulate new Radio transmission
  const handleSimulateRadioIntercept = async () => {
    setIsSimulatingAudio(true);
    try {
      const activeFeed = scannerFeeds[0] || { id: 'feed-lvmpd-strip' };
      const res = await fetch('/api/scanner/transcripts/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedId: activeFeed.id,
          unit: 'Motors-42',
          tenCode: 'Signal 10',
          tenCodeMeaning: 'Live Roadway Obstruction',
          transcript: `Control, Motors-42 clearing stalled vehicle from right lane near CCTV #${newFixItCameraId || 21603}. Traffic flow resuming.`,
          locationKeyword: 'Las Vegas Blvd Resort Corridor',
          cameraId: newFixItCameraId || 21603,
          priority: 'high'
        })
      });
      const data = await res.json();
      if (data.success && data.transcript) {
        setTranscripts((prev) => [data.transcript, ...prev]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSimulatingAudio(false);
    }
  };

  // Filtered and sorted News Items (Default sorted by timestamp descending)
  const filteredNews = useMemo(() => {
    const list = newsItems.filter((n) => {
      const matchChannel = selectedNewsChannel === 'all' || n.channelSlug === selectedNewsChannel;
      const matchSearch =
        searchQuery === '' ||
        n.headline.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.channel.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.corridor.toLowerCase().includes(searchQuery.toLowerCase());
      return matchChannel && matchSearch;
    });

    return list.sort((a, b) => {
      const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return sortOrder === 'desc' ? diff : -diff;
    });
  }, [newsItems, selectedNewsChannel, searchQuery, sortOrder]);

  // Filtered and sorted Correlation Events
  const filteredCorrelation = useMemo(() => {
    const list = correlationEvents.filter((e) => {
      const matchSearch =
        searchQuery === '' ||
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.primaryLocation.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.corridor.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });

    return list.sort((a, b) => {
      const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return sortOrder === 'desc' ? diff : -diff;
    });
  }, [correlationEvents, searchQuery, sortOrder]);

  // Filtered and sorted transcripts
  const filteredTranscripts = useMemo(() => {
    const list = transcripts.filter((t) => {
      const matchFeed = selectedFeedId === 'all' || t.feedId === selectedFeedId;
      const matchPriority = selectedPriority === 'all' || t.priority === selectedPriority;
      const matchSearch =
        searchQuery === '' ||
        t.transcript.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.callSign.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.locationKeyword.toLowerCase().includes(searchQuery.toLowerCase());
      return matchFeed && matchPriority && matchSearch;
    });

    return list.sort((a, b) => {
      const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return sortOrder === 'desc' ? diff : -diff;
    });
  }, [transcripts, selectedFeedId, selectedPriority, searchQuery, sortOrder]);

  // Filtered and sorted FixIt reports
  const filteredFixIt = useMemo(() => {
    const list = fixItReports.filter((r) => {
      const matchStatus = selectedFixItStatus === 'all' || r.status === selectedFixItStatus;
      const matchSearch =
        searchQuery === '' ||
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.ticketId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchSearch;
    });

    return list.sort((a, b) => {
      const diff = new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      return sortOrder === 'desc' ? diff : -diff;
    });
  }, [fixItReports, selectedFixItStatus, searchQuery, sortOrder]);

  // Filtered and sorted social posts
  const filteredSocial = useMemo(() => {
    const list = socialPosts.filter((s) => {
      const matchPlatform = selectedPlatform === 'all' || s.platform === selectedPlatform;
      const matchSearch =
        searchQuery === '' ||
        s.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.authorHandle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.hashtags.some((h) => h.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchPlatform && matchSearch;
    });

    return list.sort((a, b) => {
      const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return sortOrder === 'desc' ? diff : -diff;
    });
  }, [socialPosts, selectedPlatform, searchQuery, sortOrder]);

  // Unified All-Incidents Feed combining News, Correlation, Radio Scanners, FixIt 311, and Social Posts
  const unifiedIncidents = useMemo(() => {
    const all: Array<{
      id: string;
      sourceType: 'news' | 'correlation' | 'scanner' | 'fixit' | 'social';
      title: string;
      subtitle: string;
      content: string;
      timestamp: string;
      corridor: string;
      cameraId?: number;
      cameraName?: string;
      badge: string;
      badgeColor: string;
      sourceUrl?: string;
      sourceDomain?: string;
      sourceLabel: string;
    }> = [];

    // News
    filteredNews.forEach((n) => {
      all.push({
        id: `uni-news-${n.id}`,
        sourceType: 'news',
        title: n.headline,
        subtitle: n.channel,
        content: n.summary,
        timestamp: n.timestamp,
        corridor: n.corridor,
        cameraId: n.nearestCameraId,
        cameraName: n.nearestCameraName,
        badge: n.badge,
        badgeColor: 'bg-amber-950 text-amber-300 border-amber-800',
        sourceUrl: n.sourceUrl,
        sourceDomain: n.sourceDomain,
        sourceLabel: n.channel
      });
    });

    // Correlation
    filteredCorrelation.forEach((c) => {
      all.push({
        id: `uni-corr-${c.id}`,
        sourceType: 'correlation',
        title: c.title,
        subtitle: `${c.incidentType} (${c.confidenceScore}% confidence)`,
        content: c.summary,
        timestamp: c.timestamp,
        corridor: c.corridor,
        cameraId: c.nearestCameraId,
        cameraName: c.nearestCameraName,
        badge: 'CROSS-CORRELATED',
        badgeColor: 'bg-purple-950 text-purple-300 border-purple-800',
        sourceUrl: c.sources.hasNews ? c.sources.newsSourceUrl : 'https://bugatti.nvfast.org/',
        sourceDomain: c.sources.hasNews ? 'news-verified' : 'bugatti.nvfast.org',
        sourceLabel: 'NV FAST & Scanner Intercept'
      });
    });

    // Scanner
    filteredTranscripts.forEach((t) => {
      all.push({
        id: `uni-trans-${t.id}`,
        sourceType: 'scanner',
        title: `${t.callSign} (${t.unit}): ${t.tenCodeMeaning || t.tenCode || 'Radio Intercept'}`,
        subtitle: `${t.agency} • ${t.talkgroup}`,
        content: t.transcript,
        timestamp: t.timestamp,
        corridor: 'Resort & Freeway Corridors',
        cameraId: t.correlatedCameraId,
        cameraName: t.correlatedCameraName,
        badge: t.priority.toUpperCase(),
        badgeColor: 'bg-rose-950 text-rose-300 border-rose-800',
        sourceUrl: 'https://www.broadcastify.com/listen/feed/21146',
        sourceDomain: 'broadcastify.com',
        sourceLabel: 'Broadcastify Scanner'
      });
    });

    // FixIt
    filteredFixIt.forEach((f) => {
      all.push({
        id: `uni-fix-${f.ticketId}`,
        sourceType: 'fixit',
        title: f.title,
        subtitle: `${f.address} • Ticket #${f.ticketId}`,
        content: f.description,
        timestamp: f.submittedAt,
        corridor: f.corridor,
        cameraId: f.nearestCameraId,
        cameraName: f.nearestCameraName,
        badge: f.status.toUpperCase(),
        badgeColor: 'bg-blue-950 text-blue-300 border-blue-800',
        sourceUrl: 'https://www.clarkcountynv.gov/residents/fixit_clark_county.php',
        sourceDomain: 'clarkcountynv.gov',
        sourceLabel: 'FixIt Clark County 311'
      });
    });

    // Social
    filteredSocial.forEach((s) => {
      all.push({
        id: `uni-soc-${s.id}`,
        sourceType: 'social',
        title: `${s.authorName} (${s.authorHandle}) on ${s.platform.toUpperCase()}`,
        subtitle: `${s.locationName} (${s.corridor})`,
        content: s.content,
        timestamp: s.timestamp,
        corridor: s.corridor,
        cameraId: s.nearestCameraId,
        cameraName: s.nearestCameraName,
        badge: s.platform.toUpperCase(),
        badgeColor: 'bg-cyan-950 text-cyan-300 border-cyan-800',
        sourceUrl: s.platform === 'x' ? 'https://x.com/search?q=las%20vegas%20traffic' : s.platform === 'snapchat' ? 'https://map.snapchat.com/' : 'https://www.tiktok.com/tag/lasvegas',
        sourceDomain: `${s.platform}.com`,
        sourceLabel: `${s.platform.toUpperCase()} Social Radar`
      });
    });

    return all.sort((a, b) => {
      const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return sortOrder === 'desc' ? diff : -diff;
    });
  }, [filteredNews, filteredCorrelation, filteredTranscripts, filteredFixIt, filteredSocial, sortOrder]);

  return (
    <div className="space-y-5">
      {/* Top Banner & Multi-Source Stats */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-2 py-0.5 rounded bg-red-950/90 text-red-400 font-mono text-xs border border-red-800 font-bold flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                MULTI-VECTOR CRIME RADAR & PUBLIC SAFETY INTELLIGENCE
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 text-xs font-semibold border border-emerald-800 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Cross-Correlated Live
              </span>
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide mt-1.5">
              Major News Desks • Broadcastify Scanners • FixIt Clark County • Social Feeds
            </h2>

            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Real-time multi-vector intelligence scanning all major Las Vegas news channels (8 News Now, FOX5 Vegas, News 3, 13 Action News, Review-Journal, Sun), live police/fire radio transcripts, municipal 311 civic reports, and geolocated social media radar anchored to 1,238 NV FAST CCTV traffic cameras. Default sorted by timestamp.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={handleScanNewsChannels}
              disabled={isScanningNews}
              className="px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              <Newspaper className={`w-3.5 h-3.5 ${isScanningNews ? 'animate-spin' : ''}`} />
              <span>{isScanningNews ? 'Scanning Channels...' : 'Scan News Channels'}</span>
            </button>

            <button
              onClick={handleUpdateAllIncidents}
              disabled={isUpdatingAll}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white border border-slate-700 font-medium rounded-lg text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingAll ? 'animate-spin' : ''}`} />
              <span>{isUpdatingAll ? 'Updating...' : 'Update All Incidents'}</span>
            </button>

            <button
              onClick={() => handleRunAiSynthesis(21603, 'Bellagio incident')}
              disabled={isSynthesizing}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSynthesizing ? 'animate-spin' : ''}`} />
              <span>{isSynthesizing ? 'Synthesizing...' : 'AI Synthesis'}</span>
            </button>

            <button
              onClick={() => setShowNewFixItModal(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium rounded-lg text-xs flex items-center gap-1.5 transition-all"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              <span>Log FixIt</span>
            </button>
          </div>
        </div>

        {/* Live Vector Badges Grid (5 vectors including Major News Channels) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-2 border-t border-slate-800/80">
          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
              <Newspaper className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">News Channels</div>
              <div className="text-xs font-bold text-white flex items-center gap-1">
                <span>{newsItems.length} Scanned</span>
                <span className="text-[9px] text-amber-400 font-mono">LIVE</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
              <Radio className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">Broadcastify</div>
              <div className="text-xs font-bold text-white flex items-center gap-1">
                <span>{scannerFeeds.length} Feeds</span>
                <span className="text-[9px] text-emerald-400 font-mono">ON</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">
              <Building className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">FixIt Clark Co.</div>
              <div className="text-xs font-bold text-white">
                <span>{fixItReports.length} Tickets</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center flex-shrink-0">
              <Share2 className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">Social Radar</div>
              <div className="text-xs font-bold text-white">
                <span>{socialPosts.length} Eyewitness</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0">
              <GitMerge className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">Cross-Correlation</div>
              <div className="text-xs font-bold text-white">
                <span>{correlationEvents.length} Verified</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Incident Synthesis Result Card (if active) */}
      {aiSynthesisResult && (
        <div className="bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border border-amber-500/50 rounded-xl p-4 sm:p-5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 font-mono text-[11px] font-bold rounded border border-amber-500/40 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  GEMINI AI MULTI-VECTOR SYNTHESIS
                </span>
                <span className="text-xs text-slate-400">
                  Confidence: <strong className="text-emerald-400">{aiSynthesisResult.confidenceScore || 96}%</strong>
                </span>
              </div>

              <h3 className="text-base font-bold text-white">{aiSynthesisResult.title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
                {aiSynthesisResult.executiveSummary}
              </p>

              {aiSynthesisResult.keyTakeaways && (
                <div className="space-y-1 pt-1">
                  {aiSynthesisResult.keyTakeaways.map((point: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              )}

              {aiSynthesisResult.recommendedAction && (
                <div className="mt-2 text-xs bg-slate-800/80 p-2.5 rounded border border-slate-700 text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>
                    <strong>TMC Operator Directive:</strong> {aiSynthesisResult.recommendedAction}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => setAiSynthesisResult(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800 border border-slate-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Primary Sub-Tabs Navigation & Timestamp Sort Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
          <button
            onClick={() => setActiveIntelTab('all_incidents')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeIntelTab === 'all_incidents'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>All Incidents (Unified)</span>
            <span className="px-1.5 py-0.2 bg-black/30 rounded text-[10px]">
              {unifiedIncidents.length}
            </span>
          </button>

          <button
            onClick={() => setActiveIntelTab('news')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeIntelTab === 'news'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span>Major News Channels</span>
            <span className="px-1.5 py-0.2 bg-black/30 rounded text-[10px]">
              {filteredNews.length}
            </span>
          </button>

          <button
            onClick={() => setActiveIntelTab('correlation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeIntelTab === 'correlation'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>Cross-Correlation</span>
            <span className="px-1.5 py-0.2 bg-black/30 rounded text-[10px]">
              {filteredCorrelation.length}
            </span>
          </button>

          <button
            onClick={() => setActiveIntelTab('scanner')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeIntelTab === 'scanner'
                ? 'bg-rose-600 text-white shadow-md font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Broadcastify Audio</span>
            <span className="px-1.5 py-0.2 bg-black/30 rounded text-[10px]">
              {filteredTranscripts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveIntelTab('fixit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeIntelTab === 'fixit'
                ? 'bg-blue-600 text-white shadow-md font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>FixIt Clark County 311</span>
            <span className="px-1.5 py-0.2 bg-black/30 rounded text-[10px]">
              {filteredFixIt.length}
            </span>
          </button>

          <button
            onClick={() => setActiveIntelTab('social')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeIntelTab === 'social'
                ? 'bg-purple-600 text-white shadow-md font-bold'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Social Radar</span>
            <span className="px-1.5 py-0.2 bg-black/30 rounded text-[10px]">
              {filteredSocial.length}
            </span>
          </button>
        </div>

        {/* Sort Controls & Global Search */}
        <div className="flex items-center gap-2">
          {/* Timestamp Sort Toggle Pill */}
          <button
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            title="Toggle timestamp sorting order"
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-xs transition-colors"
          >
            <ArrowUpDown className="w-3 h-3 text-amber-400" />
            <span className="text-[11px]">
              Default: <strong>{sortOrder === 'desc' ? 'Timestamp (Newest First)' : 'Timestamp (Oldest First)'}</strong>
            </span>
          </button>

          <div className="relative w-44 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter incidents & news..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* TAB 1: CROSS-CORRELATION MATRIX */}
      {activeIntelTab === 'correlation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {correlationEvents.map((evt) => {
              const matchedCam = cameras.find((c) => c.id === evt.nearestCameraId);

              return (
                <div
                  key={evt.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm hover:border-amber-500/60 transition-all flex flex-col md:flex-row"
                >
                  {/* Left: CCTV Camera live snapshot frame */}
                  <div className="md:w-72 bg-black flex-shrink-0 relative overflow-hidden group">
                    <img
                      src={`/api/camera-snapshot/${evt.nearestCameraId}?t=${liveTimestamp}`}
                      alt={evt.nearestCameraName}
                      className="w-full h-48 md:h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/40 pointer-events-none" />

                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-red-950/90 text-red-400 font-mono text-[10px] border border-red-800 font-bold">
                        CCTV #{evt.nearestCameraId}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-400 text-[10px] font-bold border border-emerald-800 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        LIVE
                      </span>
                    </div>

                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                      <button
                        onClick={() => matchedCam && onSelectCamera(matchedCam)}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded flex items-center gap-1 shadow transition-colors"
                      >
                        <Camera className="w-3 h-3" />
                        <span>Open Camera</span>
                      </button>
                      <span className="text-[10px] text-slate-300 font-mono">
                        {evt.confidenceScore}% Correlation
                      </span>
                    </div>
                  </div>

                  {/* Right: Multi-Source Evidence Dossier */}
                  <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-purple-950 text-purple-300 text-[10px] font-bold uppercase rounded border border-purple-800">
                              {evt.incidentType}
                            </span>
                            <span className="text-xs text-slate-400 font-medium">
                              {evt.corridor}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-white mt-1">{evt.title}</h3>
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            <span>{evt.primaryLocation}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-emerald-400 font-bold">
                            Score: {evt.confidenceScore}% Match
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 mt-2.5 leading-relaxed bg-slate-950/40 p-2.5 rounded border border-slate-800/80">
                        {evt.summary}
                      </p>

                      {/* Evidence Pill Matrix */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 text-xs">
                        {/* 1. Broadcastify Evidence */}
                        <div
                          className={`p-2 rounded border ${
                            evt.sources.hasScanner
                              ? 'bg-rose-950/30 border-rose-800/60 text-rose-200'
                              : 'bg-slate-800/30 border-slate-800 text-slate-500'
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold mb-1">
                            <span className="flex items-center gap-1 text-[11px]">
                              <Radio className="w-3 h-3 text-rose-400" />
                              Broadcastify Scanner
                            </span>
                            {evt.sources.hasScanner && (
                              <span className="text-[10px] font-mono text-rose-400">VERIFIED</span>
                            )}
                          </div>
                          <p className="text-[11px] line-clamp-2 text-slate-300">
                            {evt.sources.scannerSnippet || 'No radio traffic logged.'}
                          </p>
                        </div>

                        {/* 2. FixIt Clark County Evidence */}
                        <div
                          className={`p-2 rounded border ${
                            evt.sources.hasFixIt
                              ? 'bg-blue-950/30 border-blue-800/60 text-blue-200'
                              : 'bg-slate-800/30 border-slate-800 text-slate-500'
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold mb-1">
                            <span className="flex items-center gap-1 text-[11px]">
                              <Building className="w-3 h-3 text-blue-400" />
                              FixIt Clark County
                            </span>
                            {evt.sources.hasFixIt && (
                              <span className="text-[10px] font-mono text-blue-400">
                                #{evt.sources.fixItTicketId}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] line-clamp-2 text-slate-300">
                            {evt.sources.hasFixIt
                              ? `Category: ${evt.sources.fixItCategory?.replace(/_/g, ' ')}`
                              : 'No municipal 311 ticket reported.'}
                          </p>
                        </div>

                        {/* 3. Social Media Eyewitnesses */}
                        <div
                          className={`p-2 rounded border ${
                            evt.sources.hasSocial
                              ? 'bg-purple-950/30 border-purple-800/60 text-purple-200'
                              : 'bg-slate-800/30 border-slate-800 text-slate-500'
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold mb-1">
                            <span className="flex items-center gap-1 text-[11px]">
                              <Share2 className="w-3 h-3 text-purple-400" />
                              Social Radar
                            </span>
                            <div className="flex items-center gap-1">
                              {evt.sources.socialPlatforms.map((p) => (
                                <span
                                  key={p}
                                  className="px-1 py-0.2 bg-purple-900 text-purple-200 text-[9px] uppercase font-bold rounded"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          </div>
                          <p className="text-[11px] line-clamp-2 text-slate-300">
                            {evt.sources.socialSnippet || 'No public social tags detected.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                      <span className="text-slate-400 font-mono text-[11px]">
                        Event ID: {evt.id} • {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRunAiSynthesis(evt.nearestCameraId, evt.title)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded text-xs flex items-center gap-1 transition-colors"
                        >
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span>Synthesize Event</span>
                        </button>

                        <button
                          onClick={() => matchedCam && onSelectCamera(matchedCam)}
                          className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-xs flex items-center gap-1 transition-colors"
                        >
                          <span>Live Slew & Verify</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: BROADCASTIFY LIVE SCANNERS & SPEECH-TO-TEXT TRANSCRIPTS */}
      {activeIntelTab === 'scanner' && (
        <div className="space-y-4">
          {/* Audio Channels Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-bold text-white">
                  Broadcastify Live Emergency Audio Feeds
                </h3>
              </div>
              <button
                onClick={handleSimulateRadioIntercept}
                disabled={isSimulatingAudio}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/40 rounded text-xs flex items-center gap-1 font-medium transition-colors"
              >
                <Radio className={`w-3 h-3 ${isSimulatingAudio ? 'animate-spin' : ''}`} />
                <span>Simulate Dispatch Intercept</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {scannerFeeds.map((feed) => {
                const isPlaying = playingFeedId === feed.id;

                return (
                  <div
                    key={feed.id}
                    className={`p-3 rounded-lg border transition-all flex flex-col justify-between gap-2 ${
                      isPlaying
                        ? 'bg-rose-950/40 border-rose-500/80 shadow-md shadow-rose-950/30'
                        : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-1.5 py-0.5 bg-slate-900 text-rose-300 font-mono text-[10px] font-bold rounded border border-rose-900/60">
                          {feed.agency}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {feed.frequencyMhz.toFixed(4)} MHz
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white mt-1.5 line-clamp-1">{feed.name}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-tight">
                        {feed.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/50 text-xs">
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{feed.listenersCount} listeners</span>
                      </div>

                      <button
                        onClick={() => togglePlayFeed(feed.id)}
                        className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors ${
                          isPlaying
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                        }`}
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="w-3 h-3" />
                            <span>Monitoring</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3" />
                            <span>Listen</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Audio Pulse Visualizer when playing */}
                    {isPlaying && (
                      <div className="flex items-center justify-center gap-1 h-3 pt-1">
                        <span className="w-1 bg-rose-400 rounded animate-bounce h-3" />
                        <span className="w-1 bg-rose-400 rounded animate-bounce h-2 delay-75" />
                        <span className="w-1 bg-rose-400 rounded animate-bounce h-3.5 delay-150" />
                        <span className="w-1 bg-rose-400 rounded animate-bounce h-2 delay-100" />
                        <span className="w-1 bg-rose-400 rounded animate-bounce h-3 delay-200" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transcripts Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Speech-to-Text Police &amp; Fire Transcripts</span>
                  <span className="px-2 py-0.5 bg-rose-950 text-rose-400 text-xs font-mono font-bold rounded border border-rose-800">
                    Live Audio Intercepts
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automated STT transcription tagged with 10-codes, dispatch units, and nearest CCTV cameras.
                </p>
              </div>

              {/* Priority Filter */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-400 mr-1">Priority:</span>
                {['all', 'critical', 'high', 'medium'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setSelectedPriority(p)}
                    className={`px-2 py-0.5 rounded capitalize text-[11px] font-medium transition-colors ${
                      selectedPriority === p
                        ? 'bg-rose-600 text-white font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              {filteredTranscripts.map((t) => {
                const matchedCam = t.correlatedCameraId
                  ? cameras.find((c) => c.id === t.correlatedCameraId)
                  : undefined;

                return (
                  <div
                    key={t.id}
                    className="p-3.5 bg-slate-800/60 border border-slate-700/70 rounded-lg hover:border-slate-500 transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                            t.priority === 'critical'
                              ? 'bg-rose-950 text-rose-300 border border-rose-700 animate-pulse'
                              : t.priority === 'high'
                              ? 'bg-amber-950 text-amber-300 border border-amber-700'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {t.priority}
                        </span>

                        <span className="text-xs font-bold text-white font-mono">{t.callSign}</span>
                        <span className="text-xs text-slate-400">({t.agency})</span>

                        {t.tenCode && (
                          <span className="px-1.5 py-0.5 bg-slate-900 text-amber-400 font-mono text-[10px] rounded border border-slate-700">
                            {t.tenCode}: {t.tenCodeMeaning}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(t.timestamp).toLocaleTimeString()} • {t.rawAudioDurationSec}s audio
                      </span>
                    </div>

                    {/* Transcript body */}
                    <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 text-xs text-slate-200 font-mono leading-relaxed">
                      "{t.transcript}"
                    </div>

                    {/* Camera connection link */}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <MapPin className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        <span>{t.locationKeyword}</span>
                        {t.distanceMeters && <span>• ~{t.distanceMeters}m from camera</span>}
                      </div>

                      {matchedCam && (
                        <button
                          onClick={() => onSelectCamera(matchedCam)}
                          className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-amber-300 rounded text-xs flex items-center gap-1 font-medium transition-colors"
                        >
                          <Camera className="w-3 h-3" />
                          <span>View CCTV #{matchedCam.id}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FIXIT CLARK COUNTY MUNICIPAL 311 DATABASE */}
      {activeIntelTab === 'fixit' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-bold text-white">
                    FixIt Clark County Official Municipal Portal (SeeClickFix)
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Public Works &amp; Traffic Engineering reports cross-referenced against nearest CCTV cameras.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowNewFixItModal(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Report Road / Signal Hazard</span>
                </button>
              </div>
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 scrollbar-thin">
              <span className="text-slate-400 font-medium mr-1">Status:</span>
              {['all', 'received', 'in_progress', 'scheduled', 'resolved'].map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedFixItStatus(st)}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap text-xs font-medium transition-colors capitalize ${
                    selectedFixItStatus === st
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Tickets Feed */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredFixIt.map((report) => {
              const matchedCam = cameras.find((c) => c.id === report.nearestCameraId);

              return (
                <div
                  key={report.ticketId}
                  className="bg-slate-900 border border-slate-800 hover:border-blue-500/60 rounded-xl p-4 shadow-sm flex flex-col justify-between gap-3 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 text-[10px] font-mono font-bold border border-blue-800">
                            {report.ticketId}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              report.status === 'in_progress'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : report.status === 'resolved'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {report.status.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {report.category.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-white mt-1.5">{report.title}</h4>
                      </div>

                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(report.submittedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded border border-slate-800">
                      {report.description}
                    </p>

                    <div className="text-[11px] text-slate-400 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="text-slate-300">{report.address}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span>Assigned: {report.assignedDepartment}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom CCTV Node linkage */}
                  <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <ThumbsUp className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-slate-300 text-[11px]">{report.upvotes} Citizen Upvotes</span>
                    </div>

                    {matchedCam && (
                      <button
                        onClick={() => onSelectCamera(matchedCam)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded text-xs flex items-center gap-1 font-medium transition-colors"
                      >
                        <Camera className="w-3 h-3" />
                        <span>Inspect CCTV #{matchedCam.id}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: MULTI-PLATFORM SOCIAL RADAR */}
      {activeIntelTab === 'social' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">
                    Multi-Platform Social Media Geofence Radar
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scanning Snapchat Snap Map, X, TikTok, Facebook Groups, Instagram Reels, and Reddit Vegas.
                </p>
              </div>

              {/* Platform Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 scrollbar-thin">
                <span className="text-slate-400 font-medium mr-1">Platform:</span>
                {['all', 'x', 'snapchat', 'tiktok', 'facebook', 'instagram', 'reddit'].map((pl) => (
                  <button
                    key={pl}
                    onClick={() => setSelectedPlatform(pl)}
                    className={`px-2.5 py-1 rounded-full uppercase text-[10px] font-bold transition-colors ${
                      selectedPlatform === pl
                        ? 'bg-purple-600 text-white shadow'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    {pl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Social Posts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSocial.map((post) => {
              const matchedCam = cameras.find((c) => c.id === post.nearestCameraId);

              return (
                <div
                  key={post.id}
                  className="bg-slate-900 border border-slate-800 hover:border-purple-500/60 rounded-xl p-4 shadow-sm flex flex-col justify-between gap-3 transition-all"
                >
                  <div className="space-y-2.5">
                    {/* Header: Author & Platform Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={post.authorAvatar}
                          alt={post.authorName}
                          className="w-8 h-8 rounded-full object-cover border border-slate-700"
                        />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-white">{post.authorName}</span>
                            {post.verifiedUser && (
                              <CheckCircle2 className="w-3 h-3 text-blue-400" />
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {post.authorHandle}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          post.platform === 'x'
                            ? 'bg-black text-white border border-slate-700'
                            : post.platform === 'snapchat'
                            ? 'bg-yellow-400 text-black font-extrabold'
                            : post.platform === 'tiktok'
                            ? 'bg-slate-950 text-cyan-300 border border-cyan-800'
                            : post.platform === 'facebook'
                            ? 'bg-blue-600 text-white'
                            : post.platform === 'instagram'
                            ? 'bg-pink-600 text-white'
                            : 'bg-orange-600 text-white'
                        }`}
                      >
                        {post.platform}
                      </span>
                    </div>

                    {/* Post Content */}
                    <p className="text-xs text-slate-200 leading-relaxed font-sans">
                      {post.content}
                    </p>

                    {/* Media preview (video / photo) */}
                    {post.mediaUrl && (
                      <div className="aspect-video bg-black rounded-lg overflow-hidden relative group">
                        <img
                          src={post.mediaUrl}
                          alt="Eyewitness Media"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        {post.mediaType === 'video' && (
                          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/80 rounded text-[10px] font-mono text-white flex items-center gap-1">
                            <Video className="w-3 h-3 text-red-400" />
                            <span>0:{post.videoDurationSec || 15} Eyewitness Clip</span>
                          </div>
                        )}
                        <span className="absolute top-2 right-2 px-1.5 py-0.5 bg-slate-950/80 rounded text-[9px] font-bold text-amber-300 border border-amber-500/40">
                          Geotagged
                        </span>
                      </div>
                    )}

                    {/* Location and Hashtags */}
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center gap-1 text-slate-400">
                        <MapPin className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        <span className="truncate">{post.locationName}</span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {post.hashtags.map((h, hIdx) => (
                          <span
                            key={hIdx}
                            className="text-[10px] text-purple-400 bg-purple-950/60 px-1.5 py-0.2 rounded border border-purple-800/40"
                          >
                            #{h}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Engagement & CCTV Link */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                      <span>❤️ {post.engagement.likes.toLocaleString()}</span>
                      <span>🔄 {post.engagement.shares.toLocaleString()}</span>
                      {post.engagement.views && (
                        <span>👁️ {post.engagement.views.toLocaleString()}</span>
                      )}
                    </div>

                    {matchedCam && (
                      <button
                        onClick={() => onSelectCamera(matchedCam)}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded text-[11px] flex items-center gap-1 font-medium transition-colors"
                      >
                        <Camera className="w-3 h-3" />
                        <span>CCTV #{matchedCam.id}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: SUBMIT FIXIT CLARK COUNTY REPORT */}
      {showNewFixItModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg p-5 text-slate-100 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Log FixIt Clark County 311 Ticket</h3>
              </div>
              <button
                onClick={() => setShowNewFixItModal(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmitFixIt} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Issue Category</label>
                <select
                  value={newFixItCategory}
                  onChange={(e) => setNewFixItCategory(e.target.value as FixItCategory)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="traffic_signal_failure">Traffic Signal Malfunction (Flashing / Dark)</option>
                  <option value="roadway_hazard_debris">Roadway Hazard / Lane Debris</option>
                  <option value="street_light_out">Street Light Out / Knocked Down</option>
                  <option value="pothole_asphalt">Deep Pothole / Road Deterioration</option>
                  <option value="damaged_guardrail">Damaged Guardrail / Attenuator</option>
                  <option value="illegal_dumping">Illegal Dumping Blocking Lane</option>
                  <option value="flooding_drainage">Flooding / Storm Drain Backed Up</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Report Title</label>
                <input
                  type="text"
                  placeholder="e.g., Traffic Signal Head Turned Sideways at Fremont"
                  value={newFixItTitle}
                  onChange={(e) => setNewFixItTitle(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Detailed Description &amp; Lanes Affected</label>
                <textarea
                  rows={3}
                  placeholder="Specify lane numbers, hazard dimensions, and safety impact on passing motorists..."
                  value={newFixItDescription}
                  onChange={(e) => setNewFixItDescription(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Anchor to Nearest NV FAST CCTV Node</label>
                <select
                  value={newFixItCameraId}
                  onChange={(e) => setNewFixItCameraId(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {cameras.slice(0, 30).map((c) => (
                    <option key={c.id} value={c.id}>
                      CCTV #{c.id} - {c.name} ({c.corridor})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewFixItModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFixIt}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingFixIt ? 'Submitting...' : 'Submit to Clark County Public Works'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
