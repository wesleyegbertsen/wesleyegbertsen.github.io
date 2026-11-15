import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { education } from '../../data/education.ts';
import { experience } from '../../data/experience.ts';
import { navItems } from '../../data/navigation.ts';
import { profile } from '../../data/profile.ts';
import { projects } from '../../data/projects.ts';
import { skills } from '../../data/skills.ts';
import { useMediaQuery } from '../../hooks/useMediaQuery.ts';
import { useTheme } from '../theme/ThemeContext.ts';
import { complete } from './complete.ts';
import { careerLines, contactLines } from './content.ts';
import type { Effect } from './commands.ts';
import { buildFileSystem, displayPath } from './fs.ts';
import { initialGame } from './game/engine.ts';
import { Game } from './game/Game.tsx';
import { buildLevel } from './game/level.ts';
import { useTerminalSession, type Entry } from './SessionContext.ts';
import { execute, type Env } from './shell.ts';
import styles from './Terminal.module.css';
import { useMatrixRun } from './useMatrixRun.ts';

const data = { profile, skills, experience, education, projects };
const fs = buildFileSystem(data);
const level = buildLevel(data);
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const TOUCH = '(pointer: coarse)';

const promptFor = (cwd: string) => `guest@wesleyegbertsen:${displayPath(cwd)}$`;

/** A fake shell: type a command, read the answer. The commands themselves live in the pure modules beside it. */
export function Terminal() {
  const navigate = useNavigate();
  const { index, theme, select, preview } = useTheme();
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const touch = useMediaQuery(TOUCH);

  // The scrollback, folder and history live above the routes, so they outlast a visit to another page.
  const { entries, setEntries, shell, setShell, mode, setMode, game: progressRef, nextId } = useTerminalSession();
  const [input, setInput] = useState('');
  // Where the Up/Down arrows are in the history (null: not browsing), and the line typed before browsing.
  const [cursor, setCursor] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const newEntries = (kind: Entry['kind'], lines: string[], prompt?: string): Entry[] =>
    lines.map((text) => ({ id: nextId(), kind, text, prompt }));

  const matrix = useMatrixRun({
    index,
    preview,
    reducedMotion,
    print: (line) => setEntries((current) => [...current, ...newEntries('rain', [line])]),
  });

  // Focus follows the mode: the command line in the shell, the game while it runs.
  useEffect(() => {
    (mode === 'game' ? gameRef.current : inputRef.current)?.focus({ preventScroll: true });
  }, [mode]);

  // A native listener: a click handler on a plain div is something the keyboard cannot reach, and the input
  // below it already is the keyboard way in.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const focusInput = () => {
      // Leave a selection alone, so the output can be copied.
      if (window.getSelection()?.toString()) return;
      (inputRef.current ?? gameRef.current)?.focus({ preventScroll: true });
    };
    container.addEventListener('click', focusInput);
    return () => container.removeEventListener('click', focusInput);
  }, []);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [entries]);

  const apply = (effect: Effect) => {
    switch (effect.type) {
      case 'navigate':
        navigate(effect.to);
        break;
      case 'theme':
        matrix.cancel();
        select(effect.index);
        break;
      case 'matrix':
        matrix.start();
        break;
      case 'clear':
        // The screen is emptied by submit(); a run still printing rain would refill it.
        matrix.cancel();
        break;
      case 'game':
        matrix.cancel();
        // A finished run starts again; an unfinished one is picked up where it was left.
        if (progressRef.current?.finished) progressRef.current = initialGame(level);
        setMode('game');
        break;
      case 'cd':
        // Applied by execute() and never passed on.
        break;
      default: {
        const unhandled: never = effect;
        return unhandled;
      }
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const env: Env = { fs, data, navItems, now: new Date(), themeName: theme.name, random: Math.random };
    const result = execute(input, shell, env);
    const added = [
      ...newEntries('input', [input], promptFor(shell.cwd)),
      ...newEntries('output', result.lines),
    ];

    setShell(result.state);
    setEntries((current) => (result.effects.some((e) => e.type === 'clear') ? [] : [...current, ...added]));
    setInput('');
    setCursor(null);
    result.effects.forEach(apply);
  };

  const leaveGame = (lines: string[]) => {
    setMode('shell');
    setEntries((current) => [...current, ...newEntries('output', lines)]);
  };
  const leave = () => leaveGame(["Left the run. Type 'play' to carry on."]);
  const skip = () => leaveGame(careerLines(data));

  const recall = (direction: 'up' | 'down') => {
    const { history } = shell;
    if (direction === 'up') {
      if (history.length === 0) return;
      const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
      if (cursor === null) setDraft(input);
      setCursor(next);
      setInput(history[next]!);
    } else {
      if (cursor === null) return;
      if (cursor >= history.length - 1) {
        setCursor(null);
        setInput(draft);
      } else {
        setCursor(cursor + 1);
        setInput(history[cursor + 1]!);
      }
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      recall('up');
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      recall('down');
    } else if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      matrix.cancel();
      setEntries([]);
    } else if (event.key === 'Tab' && !event.shiftKey && input.trim() !== '') {
      // Only when there is something to complete: on an empty line, or one that nothing completes, Tab still
      // moves focus on, so the input is no trap.
      const { line, candidates } = complete(input, { ...shell, fs, data, navItems });
      if (line === input && candidates.length === 0) return;
      event.preventDefault();
      setInput(line);
      if (candidates.length > 0) {
        setEntries((current) => [
          ...current,
          ...newEntries('input', [input], promptFor(shell.cwd)),
          ...newEntries('output', [candidates.join('  ')]),
        ]);
      }
    }
  };

  if (mode === 'game') {
    return (
      <div ref={containerRef} className={styles.terminal}>
        <Game
          focusRef={gameRef}
          level={level}
          storeRef={progressRef}
          reducedMotion={reducedMotion}
          touch={touch}
          contact={contactLines(data.profile)}
          prompt={promptFor(shell.cwd)}
          onLeave={leave}
          onSkip={skip}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.terminal}>
      <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-label="Terminal output">
        {entries.map((entry) =>
          entry.kind === 'input' ? (
            <div key={entry.id} className={styles.line}>
              <span className={styles.prompt}>{entry.prompt}</span> {entry.text}
            </div>
          ) : (
            <div
              key={entry.id}
              className={styles.line}
              data-kind={entry.kind}
              aria-hidden={entry.kind === 'rain' ? true : undefined}
            >
              {entry.text || ' '}
            </div>
          ),
        )}
      </div>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor={inputId}>
          Command
        </label>
        <span className={styles.prompt} aria-hidden="true">
          {promptFor(shell.cwd)}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={keyDown}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />
      </form>
    </div>
  );
}
