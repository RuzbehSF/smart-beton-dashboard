import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {motion} from 'motion/react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {invoke} from './native';

type Props = {
  connection: {id: number | null; name: string; address: string; port: number | null; username: string};
  onClose: () => void;
};

type Status = {
  output: string;
  truncated: boolean;
  finished: boolean;
  exit_code?: number | null;
  error?: string | null;
};

const PRESETS = [
  {label: 'uptime', cmd: 'uptime', desc: 'System load & uptime'},
  {label: 'free -m', cmd: 'free -m', desc: 'Memory usage (MB)'},
  {label: 'df -h', cmd: 'df -h', desc: 'Disk space'},
  {label: 'docker ps', cmd: 'docker ps', desc: 'Running containers'},
  {label: 'top (processes)', cmd: 'ps aux --sort=-%mem | head -n 12', desc: 'Top memory processes'},
  {label: 'open ports', cmd: 'ss -tulpn 2>/dev/null || netstat -tuln', desc: 'Listening TCP/UDP ports'},
  {label: 'uname -a', cmd: 'uname -a', desc: 'Kernel & OS info'},
];

export function TerminalModal({connection, onClose}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [running, setRunning] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const lastOutputLen = useRef(0);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Geist Mono, Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.35,
      convertEol: true,
      theme: {
        background: '#0c0e14',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        black: '#0f172a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#38bdf8',
        white: '#f1f5f9',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    term.writeln('\x1b[1;34m╔══════════════════════════════════════════════════════════════════════╗\x1b[0m');
    term.writeln(`\x1b[1;34m║\x1b[0m  \x1b[1;32mSmart Beton Quick SSH Terminal\x1b[0m - \x1b[37m${connection.name}\x1b[0m`);
    term.writeln(`\x1b[1;34m║\x1b[0m  Host: \x1b[36m${connection.username ? connection.username + '@' : ''}${connection.address}${connection.port ? ':' + connection.port : ''}\x1b[0m`);
    term.writeln('\x1b[1;34m║\x1b[0m  Type a command below or click any quick preset to run remotely.');
    term.writeln('\x1b[1;34m╚══════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n');

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      term.dispose();
    };
  }, [connection]);

  async function execute(cmdToRun: string) {
    const term = termRef.current;
    const cleanCmd = cmdToRun.trim();
    if (!cleanCmd || running || !connection.id) return;

    if (cleanCmd === 'clear') {
      term?.clear();
      setCommand('');
      return;
    }

    setRunning(true);
    setHistory(prev => [cleanCmd, ...prev.filter(x => x !== cleanCmd)]);
    setHistoryIndex(-1);
    setCommand('');
    lastOutputLen.current = 0;

    term?.writeln(`\x1b[1;32m➜\x1b[0m \x1b[1;37m${cleanCmd}\x1b[0m`);

    try {
      const jobId = await invoke<string>('run_ssh_command', {
        id: connection.id,
        command: cleanCmd,
      });
      setCurrentJobId(jobId);

      pollTimer.current = window.setInterval(async () => {
        try {
          const status = await invoke<Status>('command_status', {id: jobId});
          if (status.output && status.output.length > lastOutputLen.current) {
            const chunk = status.output.slice(lastOutputLen.current);
            lastOutputLen.current = status.output.length;
            term?.write(chunk);
          }

          if (status.finished) {
            if (pollTimer.current) window.clearInterval(pollTimer.current);
            pollTimer.current = null;
            setRunning(false);
            setCurrentJobId(null);

            if (status.exit_code === 0) {
              term?.writeln('\r\n\x1b[90m✔ Process finished (exit 0)\x1b[0m\r\n');
            } else if (status.exit_code !== undefined && status.exit_code !== null) {
              term?.writeln(`\r\n\x1b[31m✖ Process exited with code ${status.exit_code}\x1b[0m\r\n`);
            } else if (status.error) {
              term?.writeln(`\r\n\x1b[31m✖ Error: ${status.error}\x1b[0m\r\n`);
            }
          }
        } catch (err) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          setRunning(false);
          setCurrentJobId(null);
          term?.writeln(`\r\n\x1b[31m✖ Status poll failed: ${err}\x1b[0m\r\n`);
        }
      }, 100);
    } catch (err) {
      setRunning(false);
      term?.writeln(`\r\n\x1b[31m✖ Failed to execute: ${err}\x1b[0m\r\n`);
    }
  }

  async function cancelCurrent() {
    if (currentJobId) {
      try {
        await invoke('cancel_command', {id: currentJobId});
        termRef.current?.writeln('\r\n\x1b[33m^C Process cancelled by user.\x1b[0m\r\n');
      } catch {
        /* ignore */
      }
    }
    if (pollTimer.current) window.clearInterval(pollTimer.current);
    setRunning(false);
    setCurrentJobId(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      execute(command);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0 && historyIndex < history.length - 1) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setCommand(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCommand(history[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    }
  }

  return createPortal(
    <motion.div
      className="overlay terminal-overlay"
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      exit={{opacity: 0}}
      transition={{duration: 0.16}}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="terminal-dialog dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Quick SSH Terminal"
        initial={{opacity: 0, scale: 0.96, y: 10}}
        animate={{opacity: 1, scale: 1, y: 0}}
        exit={{opacity: 0, scale: 0.96, y: 10}}
        transition={{duration: 0.22, ease: [0.16, 1, 0.3, 1] as const}}
      >
        {/* Apple Style Traffic Light Header */}
        <div className="terminal-header">
          <div className="terminal-traffic-lights">
            <button className="traffic-light close" onClick={onClose} title="Close terminal" />
            <button className="traffic-light minimize" onClick={() => termRef.current?.clear()} title="Clear terminal" />
            <button className="traffic-light expand" onClick={() => fitRef.current?.fit()} title="Re-fit window" />
          </div>
          <div className="terminal-title">
            <span className="terminal-host-badge">{connection.name}</span>
            <span className="terminal-host-sub">
              {connection.username ? `${connection.username}@` : ''}{connection.address}
              {connection.port ? `:${connection.port}` : ''}
            </span>
          </div>
          <div className="terminal-header-actions">
            <span className={`terminal-status-pill ${running ? 'busy' : 'ready'}`}>
              <span className="pulse-indicator" />
              {running ? 'Running' : 'Ready'}
            </span>
            <button className="link tiny" onClick={() => termRef.current?.clear()}>Clear</button>
            <button className="link tiny" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Quick Presets Bar */}
        <div className="terminal-presets-bar">
          <span className="presets-label">Presets:</span>
          <div className="presets-scroll">
            {PRESETS.map(p => (
              <button
                key={p.cmd}
                type="button"
                className="terminal-preset-chip"
                disabled={running}
                title={p.desc}
                onClick={() => execute(p.cmd)}
              >
                <code>{p.label}</code>
              </button>
            ))}
          </div>
        </div>

        {/* XTerm Screen Container */}
        <div className="terminal-screen-wrap" ref={containerRef} />

        {/* Command Input Bar */}
        <div className="terminal-input-bar">
          <span className="terminal-prompt-symbol">➜</span>
          <input
            type="text"
            className="terminal-command-input"
            placeholder={running ? 'Command running... (press Cancel to interrupt)' : 'Type remote command (e.g. uname -a, docker ps, ls -la) or clear...'}
            value={command}
            disabled={running}
            autoFocus
            onChange={e => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {running ? (
            <button type="button" className="terminal-action-btn cancel" onClick={cancelCurrent}>
              Cancel (^C)
            </button>
          ) : (
            <button
              type="button"
              className="terminal-action-btn run"
              disabled={!command.trim()}
              onClick={() => execute(command)}
            >
              Run
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.querySelector('.app') ?? document.body
  );
}
