import React, { useState, useEffect, useRef } from 'react';
import {
  Delete,
  X,
  ArrowUp,
  Check,
  Keyboard,
  Hash,
  Type,
  GripHorizontal,
  ZoomIn,
  Minimize2
} from 'lucide-react';

interface VirtualKeyboardProps {
  enabled?: boolean;
  activeInput?: HTMLInputElement | HTMLTextAreaElement | null;
  onClose?: () => void;
  onToggle?: () => void;
}

type KeyboardSize = 'sm' | 'md' | 'lg' | 'xl';

const QUICK_DENOMS = [10, 20, 50, 100, 500, 1000, 2000, 5000];

// Dispatch React synthetic events so that controlled inputs (like Search inputs) update state correctly
function triggerReactInputValue(element: HTMLInputElement | HTMLTextAreaElement, newValue: string) {
  const isTextArea = element.tagName === 'TEXTAREA';
  const prototype = isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, newValue);
  } else {
    element.value = newValue;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  enabled = true,
  activeInput: externalInput,
  onClose,
  onToggle
}) => {
  const [internalInput, setInternalInput] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [isCaps, setIsCaps] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState<'QWERTY' | 'NUM'>('QWERTY');
  const [isMinimized, setIsMinimized] = useState(false);
  const [keyboardSize, setKeyboardSize] = useState<KeyboardSize>('md');

  // Drag and Drop coordinates
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: window.innerWidth > 600 ? Math.max(20, window.innerWidth - 480) : 10,
    y: window.innerHeight > 480 ? Math.max(70, window.innerHeight - 380) : 70
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0
  });

  const activeInput = externalInput || internalInput;

  // Listen to focus and click changes on inputs across the app (search boxes, modal inputs, etc.)
  useEffect(() => {
    const handleFocusOrClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        !(target as HTMLInputElement).readOnly &&
        !(target as HTMLInputElement).disabled &&
        !['file', 'checkbox', 'radio', 'date', 'color', 'hidden'].includes(
          (target as HTMLInputElement).type?.toLowerCase()
        )
      ) {
        const input = target as HTMLInputElement | HTMLTextAreaElement;
        setInternalInput(input);
        if (input.type === 'number') {
          setKeyboardMode('NUM');
        }
        setIsOpen(true);
        setIsMinimized(false);
      }
    };

    document.addEventListener('focusin', handleFocusOrClick);
    document.addEventListener('click', handleFocusOrClick);
    return () => {
      document.removeEventListener('focusin', handleFocusOrClick);
      document.removeEventListener('click', handleFocusOrClick);
    };
  }, []);

  // Drag logic via pointer events
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;
    const newX = Math.max(10, Math.min(window.innerWidth - 300, dragStartRef.current.posX + deltaX));
    const newY = Math.max(10, Math.min(window.innerHeight - 200, dragStartRef.current.posY + deltaY));
    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  if (!enabled || !isOpen) {
    return null;
  }

  const insertText = (char: string) => {
    if (!activeInput) return;
    const start = activeInput.selectionStart ?? activeInput.value.length;
    const end = activeInput.selectionEnd ?? activeInput.value.length;
    const val = activeInput.value;
    const newVal = val.substring(0, start) + char + val.substring(end);
    
    triggerReactInputValue(activeInput, newVal);
    const newPos = start + char.length;
    try {
      activeInput.setSelectionRange(newPos, newPos);
    } catch (err) {}
    activeInput.focus();
  };

  const addAmount = (amountToAdd: number) => {
    if (!activeInput) return;
    const currentVal = parseFloat(activeInput.value) || 0;
    const newVal = (currentVal + amountToAdd).toString();
    triggerReactInputValue(activeInput, newVal);
    activeInput.focus();
  };

  const backspace = () => {
    if (!activeInput) return;
    const start = activeInput.selectionStart ?? activeInput.value.length;
    const end = activeInput.selectionEnd ?? activeInput.value.length;
    const val = activeInput.value;
    if (start === end) {
      if (start === 0) return;
      const newVal = val.substring(0, start - 1) + val.substring(end);
      triggerReactInputValue(activeInput, newVal);
      try {
        activeInput.setSelectionRange(start - 1, start - 1);
      } catch (err) {}
    } else {
      const newVal = val.substring(0, start) + val.substring(end);
      triggerReactInputValue(activeInput, newVal);
      try {
        activeInput.setSelectionRange(start, start);
      } catch (err) {}
    }
    activeInput.focus();
  };

  const clearInput = () => {
    if (!activeInput) return;
    triggerReactInputValue(activeInput, '');
    activeInput.focus();
  };

  const NUM_ROWS = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
    ['.', '0', '00']
  ];

  const QWERTY_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '@', '.']
  ];

  const handleCloseKeyboard = () => {
    setIsOpen(false);
    if (onClose) onClose();
    if (onToggle) onToggle();
  };

  const toggleSize = () => {
    if (keyboardSize === 'sm') setKeyboardSize('md');
    else if (keyboardSize === 'md') setKeyboardSize('lg');
    else if (keyboardSize === 'lg') setKeyboardSize('xl');
    else setKeyboardSize('sm');
  };

  const getSizeClasses = () => {
    switch (keyboardSize) {
      case 'sm':
        return {
          container: 'w-80 p-2.5',
          keyHeight: 'h-8 text-xs',
          keyPadHeight: 'h-9 text-sm',
          spaceHeight: 'h-8 text-xs'
        };
      case 'lg':
        return {
          container: 'w-[480px] p-4',
          keyHeight: 'h-11 text-sm font-black',
          keyPadHeight: 'h-13 text-xl font-black',
          spaceHeight: 'h-11 text-sm'
        };
      case 'xl':
        return {
          container: 'w-[580px] p-5',
          keyHeight: 'h-13 text-base font-black',
          keyPadHeight: 'h-16 text-2xl font-black',
          spaceHeight: 'h-13 text-base'
        };
      case 'md':
      default:
        return {
          container: 'w-96 sm:w-[420px] p-3',
          keyHeight: 'h-9 text-xs font-bold',
          keyPadHeight: 'h-11 text-base font-extrabold',
          spaceHeight: 'h-9 text-xs'
        };
    }
  };

  const sizeStyle = getSizeClasses();

  if (isMinimized) {
    return (
      <div
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed z-50 animate-in fade-in"
      >
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white text-black shadow-xl hover:bg-slate-50 border-2 border-amber-500 text-xs font-black transition-all active:scale-95 cursor-pointer"
        >
          <Keyboard className="w-4 h-4 text-amber-600" />
          <span>Show Keyboard</span>
        </button>
      </div>
    );
  }

  return (
    <div
      id="virtual-keyboard-overlay"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className={`fixed z-50 bg-white text-black border border-slate-300 rounded-3xl shadow-2xl max-w-[calc(100vw-16px)] select-none animate-in fade-in duration-150 ${sizeStyle.container}`}
    >
      {/* Draggable Keyboard Header */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 text-xs cursor-move touch-none bg-white -mx-3 -mt-3 p-2.5 rounded-t-3xl"
      >
        <div className="flex items-center gap-1.5 truncate max-w-[50%] pointer-events-none">
          <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
          <Keyboard className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-bold text-black truncate text-xs">
            {activeInput?.placeholder || activeInput?.getAttribute('aria-label') || 'On-Screen Keyboard'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Size Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSize();
            }}
            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white text-black border border-slate-300 hover:bg-slate-50 flex items-center gap-1 cursor-pointer shadow-2xs"
            title="Toggle Keyboard Size (Small / Medium / Large / XL)"
          >
            <ZoomIn className="w-3 h-3 text-amber-600" />
            <span className="uppercase font-black">{keyboardSize}</span>
          </button>

          {/* Mode Switch */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setKeyboardMode(keyboardMode === 'QWERTY' ? 'NUM' : 'QWERTY');
            }}
            className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-white text-amber-950 border border-amber-500 hover:bg-amber-50 flex items-center gap-1 cursor-pointer shadow-2xs"
          >
            {keyboardMode === 'QWERTY' ? (
              <>
                <Hash className="w-3 h-3 text-amber-600" /> 123 (Numpad)
              </>
            ) : (
              <>
                <Type className="w-3 h-3 text-amber-600" /> ABC (Full)
              </>
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearInput();
            }}
            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white text-black border border-slate-300 hover:bg-slate-100 cursor-pointer shadow-2xs"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(true);
            }}
            className="p-1.5 rounded-lg bg-white text-black border border-slate-300 hover:bg-slate-100 cursor-pointer shadow-2xs"
            title="Minimize"
          >
            <Minimize2 className="w-3.5 h-3.5 text-slate-600" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCloseKeyboard();
            }}
            className="p-1.5 rounded-lg bg-white text-rose-600 border border-rose-300 hover:bg-rose-50 cursor-pointer shadow-2xs"
            title="Close / Turn off"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Number Pad Mode */}
      {keyboardMode === 'NUM' ? (
        <div className="space-y-2">
          {/* Quick Cash Presets (10, 20, 50, 100, 500, 1000, 2000, 5000) */}
          <div className="grid grid-cols-4 gap-1 pb-0.5">
            {QUICK_DENOMS.map((amt) => (
              <button
                key={amt}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addAmount(amt);
                }}
                className="py-1.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 font-black text-xs border border-amber-400 shadow-2xs transition-all flex items-center justify-center cursor-pointer active:scale-95"
              >
                +{amt}
              </button>
            ))}
          </div>

          {NUM_ROWS.map((row, rIdx) => (
            <div key={rIdx} className="grid grid-cols-3 gap-1.5">
              {row.map((k) => (
                <button
                  key={k}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertText(k);
                  }}
                  className={`${sizeStyle.keyPadHeight} rounded-2xl bg-white hover:bg-amber-50 hover:text-amber-950 text-black border border-slate-300 shadow-2xs transition-all flex items-center justify-center cursor-pointer active:scale-95`}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                backspace();
              }}
              className={`${sizeStyle.keyPadHeight} rounded-2xl bg-white hover:bg-rose-50 text-rose-600 font-black border border-rose-300 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs`}
            >
              <Delete className="w-4 h-4" /> Backspace
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeInput) {
                  activeInput.blur();
                }
              }}
              className={`${sizeStyle.keyPadHeight} rounded-2xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95`}
            >
              <Check className="w-4 h-4 text-amber-600" /> Done
            </button>
          </div>
        </div>
      ) : (
        /* QWERTY Mode */
        <div className="space-y-1.5">
          {QWERTY_ROWS.map((row, rIdx) => (
            <div key={rIdx} className="flex justify-center gap-1">
              {rIdx === 3 && (
                <button
                  type="button"
                  onClick={() => setIsCaps(!isCaps)}
                  className={`px-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
                    isCaps
                      ? 'bg-white text-amber-950 border-2 border-amber-500 font-black'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                  title="Caps Lock"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-amber-600" />
                </button>
              )}

              {row.map((k) => {
                const char = isCaps ? k.toUpperCase() : k;
                return (
                  <button
                    key={k}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertText(char);
                    }}
                    className={`${sizeStyle.keyHeight} min-w-[28px] sm:min-w-[32px] flex-1 rounded-xl bg-white hover:bg-amber-50 hover:text-amber-950 text-black border border-slate-300 shadow-2xs transition-all flex items-center justify-center cursor-pointer active:scale-95`}
                  >
                    {char}
                  </button>
                );
              })}

              {rIdx === 3 && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    backspace();
                  }}
                  className="px-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 font-bold text-xs border border-rose-300 flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs"
                  title="Backspace"
                >
                  <Delete className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {/* Space bar & actions */}
          <div className="flex gap-1.5 pt-1">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertText(' ');
              }}
              className={`flex-3 ${sizeStyle.spaceHeight} rounded-xl bg-white hover:bg-slate-100 text-black font-bold border border-slate-300 flex items-center justify-center cursor-pointer active:scale-98 shadow-2xs`}
            >
              Space
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeInput) {
                  activeInput.blur();
                }
              }}
              className={`flex-1 ${sizeStyle.spaceHeight} rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95`}
            >
              <Check className="w-4 h-4 text-amber-600" /> Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
