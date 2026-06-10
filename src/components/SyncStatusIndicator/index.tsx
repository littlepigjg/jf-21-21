import { Cloud, CloudOff, CloudLightning, AlertTriangle, RefreshCw, Download, Upload, CheckCircle } from 'lucide-react';
import { useSyncStore } from '@/stores/syncStore';
import { useEditorStore } from '@/stores/editorStore';

export default function SyncStatusIndicator() {
  const {
    status,
    progress,
    currentVersion,
    lastSyncTime,
    error,
    autoSync,
    setShowSyncDialog,
    pendingRemoteApply,
    triggerSync,
    dismissError,
  } = useSyncStore();

  const getStatusIcon = () => {
    switch (status) {
      case 'syncing':
      case 'uploading':
      case 'downloading':
        return <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-orange-400" />;
      case 'offline':
        return <CloudOff className="w-4 h-4 text-slate-500" />;
      case 'conflict':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      default:
        if (pendingRemoteApply) {
          return <Download className="w-4 h-4 text-emerald-400 animate-pulse" />;
        }
        return <Cloud className="w-4 h-4 text-violet-400" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'syncing':
        return `同步中 ${progress}%`;
      case 'uploading':
        return `上传中 ${progress}%`;
      case 'downloading':
        return `下载中 ${progress}%`;
      case 'error':
        return '同步失败';
      case 'offline':
        return '离线';
      case 'conflict':
        return '存在冲突';
      default:
        if (pendingRemoteApply) {
          return '有新的远程变更';
        }
        if (lastSyncTime) {
          const timeStr = new Date(lastSyncTime).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          });
          return `V${currentVersion} · ${timeStr}`;
        }
        return '未同步';
    }
  };

  const getStatusTooltip = () => {
    if (error) return error;
    switch (status) {
      case 'syncing':
        return '正在与云端同步';
      case 'uploading':
        return '正在上传本地变更';
      case 'downloading':
        return '正在下载云端变更';
      case 'error':
        return '同步出错，点击查看详情';
      case 'offline':
        return '当前离线，变更将在恢复连接后同步';
      case 'conflict':
        return '本地与云端存在冲突，请手动解决';
      default:
        if (pendingRemoteApply) {
          return '检测到远程变更，点击应用';
        }
        if (autoSync) {
          return '已启用自动同步';
        }
        return '点击手动同步';
    }
  };

  const getBgColor = () => {
    switch (status) {
      case 'error':
      case 'conflict':
        return 'hover:bg-orange-500/20';
      case 'offline':
        return 'hover:bg-slate-700/50';
      default:
        if (pendingRemoteApply) {
          return 'hover:bg-emerald-500/20 bg-emerald-500/10';
        }
        return 'hover:bg-slate-700/50';
    }
  };

  const handleClick = async () => {
    if (error) {
      dismissError();
      return;
    }
    if (
      status === 'syncing' ||
      status === 'uploading' ||
      status === 'downloading'
    ) {
      return;
    }
    if (pendingRemoteApply) {
      setShowSyncDialog(true);
      return;
    }
    const state = useEditorStore.getState();
    await triggerSync(state);
  };

  return (
    <div
      onClick={handleClick}
      title={getStatusTooltip()}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-all ${getBgColor()}`}
    >
      {status === 'uploading' && <Upload className="w-3.5 h-3.5 text-cyan-400" />}
      {status === 'downloading' && <Download className="w-3.5 h-3.5 text-cyan-400" />}
      {getStatusIcon()}
      <span className="text-xs font-mono text-slate-300">
        {getStatusText()}
      </span>
      {status === 'idle' && lastSyncTime && !pendingRemoteApply && (
        <CheckCircle className="w-3 h-3 text-emerald-400" />
      )}
      {pendingRemoteApply && (
        <CloudLightning className="w-3.5 h-3.5 text-emerald-400" />
      )}
    </div>
  );
}
