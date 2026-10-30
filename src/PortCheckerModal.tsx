import React, {useState} from 'react';
import {createPortal} from 'react-dom';
import {motion} from 'motion/react';
import {invoke} from './native';

type Props = {
  initialHost?: string;
  serverName?: string;
  onClose: () => void;
};

type CheckResult = {
  port: number;
  label: string;
  reachable: boolean;
  message: string;
  latency_ms?: number;
  testedAt: string;
};

const COMMON_PORTS = [
  {port: 22, name: 'SSH', desc: 'Secure Shell'},
  {port: 80, name: 'HTTP', desc: 'Web Server'},
  {port: 443, name: 'HTTPS', desc: 'Secure Web (SSL)'},
  {port: 5432, name: 'PostgreSQL', desc: 'PostgreSQL Database'},
  {port: 3306, name: 'MySQL', desc: 'MySQL / MariaDB'},
  {port: 6379, name: 'Redis', desc: 'Redis In-Memory Store'},
  {port: 27017, name: 'MongoDB', desc: 'MongoDB Document DB'},
  {port: 8080, name: 'Web API', desc: 'Alternative HTTP / Spring'},
  {port: 3000, name: 'Dev Server', desc: 'Node / React / Vite'},
  {port: 3389, name: 'RDP', desc: 'Remote Desktop'},
];

export function PortCheckerModal({initialHost = 'localhost', serverName, onClose}: Props) {
  const [host, setHost] = useState(initialHost);
  const [customPort, setCustomPort] = useState('80');
  const [testingPort, setTestingPort] = useState<number | null>(null);
  const [scanningAll, setScanningAll] = useState(false);
  const [results, setResults] = useState<Record<number, CheckResult>>({});
  const [error, setError] = useState('');

  async function checkSinglePort(portNum: number, label = 'Custom Port') {
    if (!host.trim()) {
      setError('Please enter a host address or IP');
      return;
    }
    setError('');
    setTestingPort(portNum);

    try {
      const res = await invoke<{reachable: boolean; message: string; latency_ms?: number}>('check_port', {
        host: host.trim(),
        port: portNum,
      });

      const now = new Date().toLocaleTimeString();
      setResults(prev => ({
        ...prev,
        [portNum]: {
          port: portNum,
          label,
          reachable: res.reachable,
          message: res.message,
          latency_ms: res.latency_ms,
          testedAt: now,
        },
      }));
    } catch (err) {
      setError(String(err));
    } finally {
      setTestingPort(null);
    }
  }

  async function scanAllCommon() {
    if (!host.trim() || scanningAll) return;
    setError('');
    setScanningAll(true);

    for (const p of COMMON_PORTS) {
      setTestingPort(p.port);
      try {
        const res = await invoke<{reachable: boolean; message: string; latency_ms?: number}>('check_port', {
          host: host.trim(),
          port: p.port,
        });
        const now = new Date().toLocaleTimeString();
        setResults(prev => ({
          ...prev,
          [p.port]: {
            port: p.port,
            label: p.name,
            reachable: res.reachable,
            message: res.message,
            latency_ms: res.latency_ms,
            testedAt: now,
          },
        }));
      } catch {
        /* skip on individual error */
      }
    }

    setTestingPort(null);
    setScanningAll(false);
  }

  return createPortal(
    <motion.div
      className="overlay port-checker-overlay"
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      exit={{opacity: 0}}
      transition={{duration: 0.16}}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="port-checker-dialog dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Port Reachability Tester"
        initial={{opacity: 0, scale: 0.96, y: 10}}
        animate={{opacity: 1, scale: 1, y: 0}}
        exit={{opacity: 0, scale: 0.96, y: 10}}
        transition={{duration: 0.22, ease: [0.16, 1, 0.3, 1] as const}}
      >
        <div className="port-checker-header">
          <div className="terminal-traffic-lights">
            <button className="traffic-light close" onClick={onClose} title="Close" />
          </div>
          <div className="port-checker-title">
            <h3>Port Reachability Test</h3>
            {serverName && <span className="port-checker-sub">{serverName}</span>}
          </div>
          <button className="link tiny" onClick={onClose}>✕</button>
        </div>

        <p className="muted" style={{fontSize: '13px', margin: '4px 0 16px'}}>
          Perform lightweight TCP handshake tests on specific network ports without transmitting application data.
        </p>

        {error && <p className="error" role="alert">{error}</p>}

        {/* Target Host Configuration */}
        <div className="port-target-row">
          <label className="port-host-label">
            <span>Target Host / IP</span>
            <input
              type="text"
              dir="ltr"
              className="port-host-input"
              value={host}
              placeholder="e.g. 192.168.1.100 or api.example.com"
              onChange={e => setHost(e.target.value)}
              disabled={scanningAll || testingPort !== null}
            />
          </label>
          <button
            type="button"
            className="port-scan-all-btn"
            disabled={scanningAll || testingPort !== null || !host.trim()}
            onClick={scanAllCommon}
          >
            {scanningAll ? 'Scanning Ports...' : '⚡ Scan Common Ports'}
          </button>
        </div>

        {/* Custom Port Quick Check */}
        <div className="custom-port-row">
          <label>
            <span>Custom Port</span>
            <input
              type="number"
              min="1"
              max="65535"
              dir="ltr"
              value={customPort}
              onChange={e => setCustomPort(e.target.value)}
              disabled={scanningAll || testingPort !== null}
            />
          </label>
          <button
            type="button"
            disabled={scanningAll || testingPort !== null || !customPort}
            onClick={() => checkSinglePort(Number(customPort), `Port ${customPort}`)}
          >
            {testingPort === Number(customPort) ? 'Testing...' : 'Check Port'}
          </button>
        </div>

        {/* Preset Port Grid */}
        <div className="port-presets-section">
          <span className="port-presets-title">Common Service Ports</span>
          <div className="port-presets-grid">
            {COMMON_PORTS.map(p => {
              const res = results[p.port];
              const isChecking = testingPort === p.port;
              return (
                <button
                  key={p.port}
                  type="button"
                  className={`port-chip ${res ? (res.reachable ? 'open' : 'closed') : ''}`}
                  disabled={scanningAll || testingPort !== null}
                  onClick={() => checkSinglePort(p.port, p.name)}
                  title={`${p.desc} (Port ${p.port})`}
                >
                  <div className="port-chip-header">
                    <span className="port-chip-name">{p.name}</span>
                    <span className="port-chip-num">:{p.port}</span>
                  </div>
                  <div className="port-chip-status">
                    {isChecking ? (
                      <span className="port-status-badge testing">Pinging...</span>
                    ) : res ? (
                      res.reachable ? (
                        <span className="port-status-badge open">🟢 Open {res.latency_ms ? `(${res.latency_ms}ms)` : ''}</span>
                      ) : (
                        <span className="port-status-badge closed">🔴 Closed</span>
                      )
                    ) : (
                      <span className="port-status-badge idle">Click to test</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Results Log Summary */}
        {Object.keys(results).length > 0 && (
          <div className="port-results-summary">
            <h4>Test Results</h4>
            <div className="port-results-list">
              {Object.values(results).map(r => (
                <div key={r.port} className={`port-result-row ${r.reachable ? 'open' : 'closed'}`}>
                  <span className="port-result-indicator">{r.reachable ? '🟢' : '🔴'}</span>
                  <strong className="port-result-name">{r.label} ({r.port})</strong>
                  <span className="port-result-msg">{r.message}</span>
                  <span className="port-result-time">{r.testedAt}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="row" style={{marginTop: '20px', justifyContent: 'flex-end'}}>
          <button type="button" className="secondary" onClick={onClose}>Done</button>
        </div>
      </motion.div>
    </motion.div>,
    document.querySelector('.app') ?? document.body
  );
}
