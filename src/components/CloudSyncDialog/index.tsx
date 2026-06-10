import { useEffect, useState } from 'react';
import {
  CloudOff,
  CloudLightning,
  RefreshCw,
  Upload,
  Download,
  X,
  CheckCircle,
  AlertTriangle,
  Clock,
  HardDrive,
  Settings,
  History,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { useSyncStore } from '@/stores/syncStore';
import { useEditorStore } from '@/stores/editorStore';
import { cn } from '@/lib/utils';
import type { ProjectSnapshot } from '@/types';

interface CloudSyncDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function CloudSyncDialog({ open, onClose }: CloudSyncDialogProps) {
  const {
    status,
    progress,
    currentVersion,
    lastSyncTime,
    error,
    autoSync,
    projectId,
    deviceId,
    pendingRemoteApply,
    setAutoSync,
    triggerSync,
    triggerForceUpload,
    triggerPull,
    applyRemoteChanges,
    resetPendingRemoteApply,
    dismissError,
  } = useSyncStore();

  const editorState = useEditorStore();
  const [pulledSnapshot, setPulledSnapshot] = useState<ProjectSnapshot | null>(null);

  useEffect(() => {
    if (open) {
      setPulledSnapshot(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSync = async () => {
    const state = useEditorStore.getState();
    await triggerSync(state);
  };

  const handleForceUpload = async () => {
    if (!confirm('确定要强制上传完整快照？这将覆盖云端当前版本。')) return;
    const state = useEditorStore.getState();
    await triggerForceUpload(state);
  };

  const handlePull = async () => {
    const snapshot = await triggerPull();
    setPulledSnapshot(snapshot);
  };

  const handleApplyRemote = () => {
    const applied = applyRemoteChanges();
    if (applied) {
      const store = useEditorStore.getState();
      if (applied.frames.length > 0) {
        store.setFrames(applied.frames);
      }
      applied.captions.forEach((_, i) => store.deleteCaption(applied.captions[i].id));
      applied.captions.forEach((c) => store.addCaption(c));
      store.setCrop(applied.crop);
      store.setExportConfig(applied.exportConfig);
    }
    onClose();
  };

  const handleDismissRemote = () => {
    resetPendingRemoteApply();
  };

  const formatTime = (t: number | null) => {
    if (!t) return '从未';
    return new Date(t).toLocaleString('zh-CN');
  };

  const getStatusBadge = () => {
    const base = 'px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1';
    switch (status) {
      case 'syncing':
      case 'uploading':
      case 'downloading':
        return (
          <span className={cn(base, 'bg-cyan-500/20 text-cyan-400')}>
            <RefreshCw className="w-3 h-3 animate-spin" />
            {status === 'uploading' ? '上传中' : status === 'downloading' ? '下载中' : '同步中'}
          </span>
        );
      case 'error':
        return (
          <span className={cn(base, 'bg-orange-500/20 text-orange-400')}>
            <AlertTriangle className="w-3 h-3" />
            出错
          </span>
        );
      case 'offline':
        return (
          <span className={cn(base, 'bg-slate-500/20 text-slate-400')}>
            <CloudOff className="w-3 h-3" />
            离线
          </span>
        );
      case 'conflict':
        return (
          <span className={cn(base, 'bg-yellow-500/20 text-yellow-400')}>
            <AlertTriangle className="w-3 h-3" />
            冲突
          </span>
        );
      default:
        return (
          <span className={cn(base, 'bg-emerald-500/20 text-emerald-400')}>
            <CheckCircle className="w-3 h-3" />
            已连接
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-[560px] max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
              <CloudLightning className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">云端同步</h2>
              <p className="text-xs text-slate-400">多设备无缝协作，增量同步节省带宽</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[calc(85vh-180px)]">
          <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="flex items-center gap-3">
              {getStatusBadge()}
              <span className="text-sm text-slate-400">当前版本</span>
              <span className="text-sm font-mono font-bold text-violet-400">V{currentVersion}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              上次同步: {formatTime(lastSyncTime)}
            </div>
          </div>

          {(status === 'syncing' || status === 'uploading' || status === 'downloading') && (
            <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-cyan-300">
                  {status === 'uploading' ? '正在上传变更...' : status === 'downloading' ? '正在下载变更...' : '正在同步...'}
                </span>
                <span className="text-sm font-mono text-cyan-400">{progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-violet-400 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-orange-300">同步出错</p>
                  <p className="text-xs text-orange-400/80 mt-0.5">{error}</p>
                </div>
                <button
                  onClick={dismissError}
                  className="text-xs text-orange-400 hover:text-orange-300 px-2 py-1 hover:bg-orange-500/20 rounded"
                >
                  忽略
                </button>
              </div>
            </div>
          )}

          {pendingRemoteApply && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <div className="flex items-start gap-2">
                <Zap className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-emerald-300">发现远程变更</p>
                  <p className="text-xs text-emerald-400/80 mt-0.5">
                    其他设备已更新此项目，是否应用到当前编辑中？
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleApplyRemote}
                  className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <ArrowRight className="w-4 h-4" />
                  应用变更
                </button>
                <button
                  onClick={handleDismissRemote}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
                >
                  稍后
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleSync}
              disabled={status === 'syncing' || status === 'uploading' || status === 'downloading'}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all hover:shadow-lg hover:shadow-violet-500/25"
            >
              <RefreshCw className={cn('w-4 h-4', (status === 'syncing' || status === 'uploading' || status === 'downloading') && 'animate-spin')} />
              立即同步
            </button>
            <button
              onClick={handlePull}
              disabled={status === 'syncing' || status === 'downloading'}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              从云端拉取
            </button>
          </div>

          {pulledSnapshot && (
            <div className="p-4 bg-slate-800/80 border border-slate-600 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-slate-200">云端快照</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-slate-500">版本</div>
                <div className="text-slate-300 font-mono">V{pulledSnapshot.version}</div>
                <div className="text-slate-500">时间</div>
                <div className="text-slate-300">{new Date(pulledSnapshot.timestamp).toLocaleString('zh-CN')}</div>
                <div className="text-slate-500">帧数</div>
                <div className="text-slate-300">{pulledSnapshot.frames.length} 帧</div>
                <div className="text-slate-500">字幕数</div>
                <div className="text-slate-300">{pulledSnapshot.captions.length} 条</div>
              </div>
            </div>
          )}

          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-200">同步设置</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">自动同步</p>
                  <p className="text-xs text-slate-500">编辑时自动上传变更到云端</p>
                </div>
                <button
                  onClick={() => setAutoSync(!autoSync)}
                  className={cn(
                    'relative w-11 h-6 rounded-full transition-colors',
                    autoSync ? 'bg-violet-600' : 'bg-slate-600'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow',
                      autoSync ? 'left-[22px]' : 'left-0.5'
                    )}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-700">
                <div>
                  <p className="text-sm text-slate-300">强制上传完整快照</p>
                  <p className="text-xs text-slate-500">全量上传，覆盖云端版本</p>
                </div>
                <button
                  onClick={handleForceUpload}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  全量上传
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-200">设备信息</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">项目 ID</span>
                <span className="text-slate-400 font-mono truncate max-w-[240px]" title={projectId}>
                  {projectId}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">设备 ID</span>
                <span className="text-slate-400 font-mono truncate max-w-[240px]" title={deviceId}>
                  {deviceId}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">本地帧数</span>
                <span className="text-slate-300">{editorState.frames.length} 帧</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">本地字幕</span>
                <span className="text-slate-300">{editorState.captions.length} 条</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border border-violet-500/20 rounded-xl">
            <div className="flex items-start gap-2">
              <Zap className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-violet-200">关于增量同步</p>
                <p className="text-xs text-violet-300/70 mt-1 leading-relaxed">
                  系统自动检测帧、字幕、配置的变更，仅上传差异部分。相比全量同步，
                  可节省 70%-95% 的带宽和时间，支持多设备无缝协作编辑。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-700 bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
