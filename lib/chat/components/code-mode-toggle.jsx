'use client';

import { useState, useEffect, useCallback } from 'react';
import { GitBranchIcon, ChevronDownIcon, SpinnerIcon } from './icons.js';
import { Combobox } from './ui/combobox.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from './ui/dropdown-menu.js';
import { cn } from '../utils.js';
import { useFeatures } from './features-context.js';

const COMMAND_LABELS = {
  'create-pr': 'Create PR',
  'draft-pr': 'Create draft PR',
  'commit-to-main': 'Commit to main',
  'rebase': 'Rebase branch',
};

/**
 * Code mode toggle with repo/branch pickers.
 * When locked (after first message), shows branch bar + headless/interactive toggle.
 *
 * @param {object} props
 * @param {boolean} props.enabled - Whether code mode is on
 * @param {Function} props.onToggle - Toggle callback
 * @param {string} props.repo - Selected repo
 * @param {Function} props.onRepoChange - Repo change callback
 * @param {string} props.branch - Selected branch
 * @param {Function} props.onBranchChange - Branch change callback
 * @param {boolean} props.locked - Whether the controls are locked (after first message)
 * @param {Function} props.getRepositories - Server action to fetch repos
 * @param {Function} props.getBranches - Server action to fetch branches
 * @param {object} [props.workspace] - Workspace object (id, repo, branch, containerName, featureBranch)
 * @param {boolean} [props.isInteractiveActive] - Whether interactive container is running
 * @param {object} [props.diffStats] - Diff stats ({ insertions, deletions })
 * @param {Function} [props.onDiffStatsRefresh] - Callback to refresh diff stats
 * @param {Function} [props.onWorkspaceUpdate] - Callback to refresh workspace state after mode toggle
 */
export function CodeModeToggle({
  enabled,
  onToggle,
  repo,
  onRepoChange,
  branch,
  onBranchChange,
  locked,
  getRepositories,
  getBranches,
  workspace,
  isInteractiveActive,
  diffStats,
  onDiffStatsRefresh,
  onWorkspaceUpdate,
}) {
  const features = useFeatures();
  const [repos, setRepos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);

  // Load repos on first toggle-on
  const handleToggle = useCallback(() => {
    if (locked) return;
    const next = !enabled;
    onToggle(next);
    if (next && !reposLoaded) {
      setLoadingRepos(true);
      getRepositories().then((data) => {
        const list = data || [];
        setRepos(list);
        setReposLoaded(true);
        setLoadingRepos(false);
        if (list.length === 1) {
          onRepoChange(list[0].full_name);
        }
      }).catch(() => setLoadingRepos(false));
    }
    if (!next) {
      onRepoChange('');
      onBranchChange('');
      setBranches([]);
    }
  }, [locked, enabled, reposLoaded, onToggle, onRepoChange, onBranchChange, getRepositories]);

  // Load branches when repo changes
  useEffect(() => {
    if (!repo || locked) return;
    setLoadingBranches(true);
    setBranches([]);
    getBranches(repo).then((data) => {
      const branchList = data || [];
      setBranches(branchList);
      // Auto-select default branch
      const defaultBranch = branchList.find((b) => b.isDefault);
      if (defaultBranch) {
        onBranchChange(defaultBranch.name);
      }
      setLoadingBranches(false);
    }).catch(() => setLoadingBranches(false));
  }, [repo]);

  const handleModeToggle = useCallback(async () => {
    if (!workspace?.id || togglingMode || isInteractiveActive) return;
    setTogglingMode(true);
    try {
      // Only launch interactive mode — closing is handled from the code page
      const { startInteractiveMode } = await import('../../code/actions.js');
      const result = await startInteractiveMode(workspace.id);
      if (result.containerName && onWorkspaceUpdate) onWorkspaceUpdate(result.containerName);
    } catch (err) {
      console.error('Failed to toggle mode:', err);
    } finally {
      setTogglingMode(false);
    }
  }, [workspace?.id, togglingMode, isInteractiveActive, onWorkspaceUpdate]);

  if (!features?.codeWorkspace) return null;

  // Locked mode: show branch bar with feature branch + mode toggle
  if (locked && enabled) {
    const featureBranch = workspace?.featureBranch;
    // Extract just the repo name (last segment of owner/repo)
    const repoName = repo ? repo.split('/').pop() : '';

    return (
      <div className="flex items-center gap-2 text-xs min-w-0 px-1 py-0.5">
        <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 overflow-hidden">
          <GitBranchIcon size={12} className="shrink-0" />
          {repoName && <span className="shrink-0 cursor-default" title={repo}>{repoName}</span>}
          {branch && (
            <>
              <span className="shrink-0 text-muted-foreground/30">/</span>
              <span className="shrink-0 font-medium text-foreground cursor-default" title={branch}>{branch}</span>
            </>
          )}
          {featureBranch && (
            <>
              <span className="shrink-0 text-muted-foreground/50">&larr;</span>
              <span className="text-primary truncate min-w-[60px] cursor-default" title={featureBranch}>{featureBranch}</span>
            </>
          )}
        </div>
        {workspace?.id && <WorkspaceCommandButton workspaceId={workspace.id} diffStats={diffStats} onDiffStatsRefresh={onDiffStatsRefresh} />}
      </div>
    );
  }

  const repoOptions = repos.map((r) => ({ value: r.full_name, label: r.full_name }));
  const branchOptions = branches.map((b) => ({ value: b.name, label: b.name }));

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {/* Slide toggle + label */}
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-2 group"
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle Code mode"
      >
        {/* Track */}
        <span
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
            enabled ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
        >
          {/* Knob */}
          <span
            className={cn(
              'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
              enabled && 'translate-x-4'
            )}
          />
        </span>
        {/* Label */}
        <span className={cn(
          'text-xs font-medium transition-colors',
          enabled ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
        )}>
          Code
        </span>
      </button>

      {/* Repo/branch pickers — inline, both always visible */}
      {enabled && (
        <>
          <div className="w-full sm:w-auto sm:min-w-[240px] sm:max-w-[240px]">
            <Combobox
              options={repoOptions}
              value={repo}
              onChange={onRepoChange}
              placeholder="Select repository..."
              loading={loadingRepos}
              highlight={!repo && !loadingRepos}
            />
          </div>
          <div className={cn("w-full sm:w-auto sm:min-w-[200px] sm:max-w-[200px]", !repo && "opacity-50 pointer-events-none")}>
            <Combobox
              options={branchOptions}
              value={branch}
              onChange={onBranchChange}
              placeholder="Select branch..."
              loading={loadingBranches}
              highlight={!!repo && !branch && !loadingBranches}
            />
          </div>
        </>
      )}
    </div>
  );
}

function WorkspaceCommandButton({ workspaceId, diffStats, onDiffStatsRefresh }) {
  const [selectedCommand, setSelectedCommand] = useState('create-pr');
  const [commandRunning, setCommandRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleRun = useCallback(async () => {
    if (commandRunning) return;
    setCommandRunning(true);
    setErrorMessage('');
    try {
      const { runWorkspaceCommand } = await import('../../code/actions.js');
      const result = await runWorkspaceCommand(workspaceId, selectedCommand);
      if (!result.success) {
        setErrorMessage(result.message || 'Command failed');
      }
      onDiffStatsRefresh?.();
    } catch (err) {
      setErrorMessage(err.message || 'Command failed');
    } finally {
      setCommandRunning(false);
    }
  }, [workspaceId, selectedCommand, commandRunning]);

  return (
    <div className="ml-auto flex items-center">
      {errorMessage && (
        <span className="text-xs text-destructive mr-2 truncate max-w-[160px]" title={errorMessage}>
          {errorMessage}
        </span>
      )}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs leading-4 px-2.5 h-[28px] flex items-center font-medium border border-border rounded-md whitespace-nowrap">
          <span className="text-green-500">+{diffStats?.insertions ?? 0}</span>
          {' '}
          <span className="text-destructive">-{diffStats?.deletions ?? 0}</span>
        </span>
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleRun}
            disabled={commandRunning}
            className="text-xs leading-4 px-2.5 h-[28px] font-medium border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors rounded-l-md disabled:opacity-50"
          >
            {commandRunning ? (
              <span className="flex items-center gap-1.5">
                <SpinnerIcon size={12} className="animate-spin" />
                Running...
              </span>
            ) : (
              COMMAND_LABELS[selectedCommand]
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button
                type="button"
                disabled={commandRunning}
                className="text-xs leading-4 px-1.5 h-[28px] font-medium border border-border border-l-0 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors rounded-r-md disabled:opacity-50 flex items-center"
              >
                <ChevronDownIcon size={14} />
              </button>
            </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="whitespace-nowrap">
            <DropdownMenuItem onClick={() => setSelectedCommand('create-pr')}>
              Create PR
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedCommand('draft-pr')}>
              Create draft PR
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSelectedCommand('commit-to-main')}>
              Commit to main
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSelectedCommand('rebase')}>
              Rebase branch
            </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
