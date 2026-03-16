import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeHrefForNavigation, normalizeHrefForStorage } from '@utils/links';
import styles from './RichTextEditor.module.css';

interface RichTextEditorProps {
  content: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  saving?: boolean;
}

/**
 * RichTextEditor - WYSIWYG editor for content editing
 * Uses TipTap editor with formatting toolbar
 */
export function RichTextEditor({ content, onSave, onCancel, saving = false }: RichTextEditorProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const [hoverLink, setHoverLink] = useState<
    | {
        href: string;
        pos: number;
        rect: DOMRect;
      }
    | null
  >(null);

  const hoverAnchorRef = useRef<HTMLAnchorElement | null>(null);
  const hoverMenuRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        validate: (href: string) => normalizeHrefForStorage(href) !== null,
        HTMLAttributes: {
          class: 'editor-link',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      TextStyle,
      Color,
    ],
    content,
    editorProps: {
      attributes: {
        class: styles.editorContent,
      },
    },
  });

  const canUndo = useMemo(() => {
    if (!editor) return false;
    try {
      return editor.can().chain().undo().run();
    } catch {
      return false;
    }
  }, [editor, editor?.state]);

  const canRedo = useMemo(() => {
    if (!editor) return false;
    try {
      return editor.can().chain().redo().run();
    } catch {
      return false;
    }
  }, [editor, editor?.state]);

  const isLinkActive = useMemo(() => {
    if (!editor) return false;
    try {
      return editor.isActive('link');
    } catch {
      return false;
    }
  }, [editor, editor?.state]);

  const currentLinkHref = useMemo(() => {
    if (!editor) return '';
    try {
      const href = editor.getAttributes('link')?.href;
      return typeof href === 'string' ? href : '';
    } catch {
      return '';
    }
  }, [editor, editor?.state]);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHideHoverMenu = (delayMs = 120) => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setHoverLink(null);
      hoverAnchorRef.current = null;
      hideTimerRef.current = null;
    }, delayMs);
  };

  // Hover menu: show quick actions for links without forcing selection.
  useEffect(() => {
    if (!editor) return;

    const dom = editor.view.dom;

    const getAnchorFromEvent = (evt: MouseEvent): HTMLAnchorElement | null => {
      const t = evt.target as HTMLElement | null;
      if (!t) return null;
      const a = t.closest('a') as HTMLAnchorElement | null;
      if (!a) return null;
      if (!dom.contains(a)) return null;
      return a;
    };

    const handleMouseOver = (evt: MouseEvent) => {
      const a = getAnchorFromEvent(evt);
      if (!a) return;

      clearHideTimer();

      const href = a.getAttribute('href') || '';
      if (!href) return;

      let pos = 0;
      try {
        pos = editor.view.posAtDOM(a, 0);
      } catch {
        return;
      }

      hoverAnchorRef.current = a;
      setHoverLink({ href, pos, rect: a.getBoundingClientRect() });
    };

    const handleMouseOut = (evt: MouseEvent) => {
      const a = getAnchorFromEvent(evt);
      if (!a) return;

      const next = evt.relatedTarget as Node | null;
      if (next) {
        if (a.contains(next)) return;
        if (hoverMenuRef.current?.contains(next)) return;
      }

      scheduleHideHoverMenu();
    };

    dom.addEventListener('mouseover', handleMouseOver);
    dom.addEventListener('mouseout', handleMouseOut);

    return () => {
      dom.removeEventListener('mouseover', handleMouseOver);
      dom.removeEventListener('mouseout', handleMouseOut);
      clearHideTimer();
    };
  }, [editor]);

  // Hide the hover menu if the viewport changes.
  useEffect(() => {
    if (!hoverLink) return;

    const hide = () => {
      setHoverLink(null);
      hoverAnchorRef.current = null;
    };

    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);

    return () => {
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, [hoverLink]);

  if (!editor) {
    return (
      <div className={styles.editor}>
        <div className={styles.loading}>Loading editor...</div>
      </div>
    );
  }

  const handleSave = () => {
    try {
      const html = editor.getHTML();
      onSave(html);
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save changes. Please try again.');
    }
  };

  const removeLink = () => {
    try {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setShowLinkInput(false);
      setLinkUrl('');
      setHoverLink(null);
      hoverAnchorRef.current = null;
    } catch (error) {
      console.error('Link remove error:', error);
    }
  };

  const removeLinkAtPos = (pos: number) => {
    try {
      editor.chain().focus().setTextSelection(pos).extendMarkRange('link').unsetLink().run();
      setShowLinkInput(false);
      setLinkUrl('');
      setHoverLink(null);
      hoverAnchorRef.current = null;
    } catch (error) {
      console.error('Link remove error:', error);
    }
  };

  const applyLink = () => {
    try {
      const nextRaw = linkUrl.trim();
      if (!nextRaw) {
        removeLink();
        return;
      }

      const normalized = normalizeHrefForStorage(nextRaw);
      if (normalized === null) {
        alert('Please enter a valid URL (e.g., https://example.com)');
        return;
      }

      editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run();
      setShowLinkInput(false);
      setLinkUrl('');
    } catch (error) {
      console.error('Link set error:', error);
    }
  };

  const toggleLinkInput = () => {
    if (showLinkInput) {
      setShowLinkInput(false);
      setLinkUrl('');
      return;
    }

    // Prefill when cursor/selection is already inside a link.
    setLinkUrl(currentLinkHref || '');
    setShowLinkInput(true);
  };

  const ToolbarButton = ({
    onClick,
    isActive = false,
    disabled = false,
    children,
    title,
    ariaLabel,
  }: {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
    ariaLabel?: string;
  }) => {
    const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        onClick();
      } catch (error) {
        console.error('Editor button error:', error);
      }
    };

    return (
      <button
        onClick={handleClick}
        onTouchEnd={handleClick}
        disabled={disabled}
        className={`${styles.toolbarButton} ${isActive ? styles.active : ''}`}
        title={title}
        aria-label={ariaLabel || title}
        type="button"
      >
        {children}
      </button>
    );
  };

  const hoverMenuStyle = (() => {
    if (!hoverLink) return null;
    if (typeof window === 'undefined') return null;

    // Position near the hovered link. Use fixed positioning so it isn't clipped by editor overflow.
    const margin = 8;
    const maxWidth = 280;
    const rect = hoverLink.rect;

    const preferAbove = rect.top > 60;
    const top = preferAbove ? rect.top - margin : rect.bottom + margin;

    const left = Math.min(Math.max(8, rect.left), window.innerWidth - maxWidth - 8);

    return {
      position: 'fixed' as const,
      top,
      left,
      maxWidth,
    };
  })();

  const openHoverLink = () => {
    if (!hoverLink) return;
    const normalized = normalizeHrefForNavigation(hoverLink.href);
    if (!normalized) return;
    window.open(normalized, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={styles.editor}>
      {hoverLink && hoverMenuStyle &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={hoverMenuRef}
            className={styles.linkHoverMenu}
            style={hoverMenuStyle}
            onMouseEnter={() => clearHideTimer()}
            onMouseLeave={() => scheduleHideHoverMenu()}
            role="dialog"
            aria-label="Link options"
          >
            <div className={styles.linkHoverMenuRow}>
              <button
                type="button"
                className={styles.linkHoverMenuButton}
                onClick={openHoverLink}
                title="Open link in a new tab"
              >
                Open
              </button>
              <button
                type="button"
                className={styles.linkHoverMenuButtonDanger}
                onClick={() => removeLinkAtPos(hoverLink.pos)}
                title="Remove link"
              >
                Remove
              </button>
            </div>
            <div className={styles.linkHoverMenuHref} title={hoverLink.href}>
              {hoverLink.href}
            </div>
          </div>,
          document.body
        )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        {/* Undo/Redo (leftmost for fast acquisition + predictable placement) */}
        <div className={styles.toolbarGroup}>
          <ToolbarButton
            onClick={() => {
              try {
                editor.chain().focus().undo().run();
              } catch (error) {
                console.error('Undo error:', error);
              }
            }}
            disabled={!canUndo}
            title="Undo (Cmd/Ctrl+Z)"
            ariaLabel="Undo"
          >
            ↶
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              try {
                editor.chain().focus().redo().run();
              } catch (error) {
                console.error('Redo error:', error);
              }
            }}
            disabled={!canRedo}
            title="Redo (Shift+Cmd/Ctrl+Z)"
            ariaLabel="Redo"
          >
            ↷
          </ToolbarButton>
        </div>

        {/* Text Formatting */}
        <div className={styles.toolbarGroup}>
          <ToolbarButton
            onClick={() => {
              try {
                editor.chain().focus().toggleBold().run();
              } catch (error) {
                console.error('Bold toggle error:', error);
              }
            }}
            isActive={editor.isActive('bold')}
            title="Bold (Cmd/Ctrl+B)"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              try {
                editor.chain().focus().toggleItalic().run();
              } catch (e) {
                console.error('Italic error:', e);
              }
            }}
            isActive={editor.isActive('italic')}
            title="Italic (Cmd/Ctrl+I)"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              try {
                editor.chain().focus().toggleUnderline().run();
              } catch (e) {
                console.error('Underline error:', e);
              }
            }}
            isActive={editor.isActive('underline')}
            title="Underline (Cmd/Ctrl+U)"
          >
            <u>U</u>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              try {
                editor.chain().focus().toggleStrike().run();
              } catch (e) {
                console.error('Strike error:', e);
              }
            }}
            isActive={editor.isActive('strike')}
            title="Strikethrough"
          >
            <s>S</s>
          </ToolbarButton>
        </div>

        {/* Headings */}
        <div className={styles.toolbarGroup}>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Heading 2 (Large)"
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            title="Heading 3 (Medium)"
          >
            H3
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            isActive={editor.isActive('heading', { level: 4 })}
            title="Heading 4 (Small)"
          >
            H4
          </ToolbarButton>
        </div>
        
        {/* Paragraph & Text */}
        <div className={styles.toolbarGroup}>
          <ToolbarButton
            onClick={() => editor.chain().focus().setParagraph().run()}
            isActive={editor.isActive('paragraph')}
            title="Paragraph"
          >
            P
          </ToolbarButton>
        </div>

        {/* Lists */}
        <div className={styles.toolbarGroup}>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="Bullet List"
          >
            •
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="Numbered List"
          >
            1.
          </ToolbarButton>
        </div>

        {/* Link */}
        <div className={styles.toolbarGroup}>
          <ToolbarButton
            onClick={toggleLinkInput}
            isActive={isLinkActive}
            title={isLinkActive ? 'Edit Link' : 'Insert Link'}
            ariaLabel={isLinkActive ? 'Edit link' : 'Insert link'}
          >
            🔗
          </ToolbarButton>
          <ToolbarButton
            onClick={removeLink}
            disabled={!isLinkActive}
            title="Remove Link"
            ariaLabel="Remove link"
          >
            ⛓✕
          </ToolbarButton>
        </div>

        {/* Alignment */}
        <div className={styles.toolbarGroup}>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            isActive={editor.isActive({ textAlign: 'left' })}
            title="Align Left"
          >
            ⬅
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            isActive={editor.isActive({ textAlign: 'center' })}
            title="Align Center"
          >
            ↔
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            isActive={editor.isActive({ textAlign: 'right' })}
            title="Align Right"
          >
            ➡
          </ToolbarButton>
        </div>

        {/* Clear Formatting */}
        <div className={styles.toolbarGroup}>
          <ToolbarButton
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            title="Clear Formatting"
          >
            ✕
          </ToolbarButton>
        </div>
      </div>

      {/* Link Input */}
      {showLinkInput && (
        <div className={styles.linkInput}>
          <input
            type="url"
            placeholder="Enter URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              } else if (e.key === 'Escape') {
                setShowLinkInput(false);
                setLinkUrl('');
              }
            }}
            autoFocus
          />
          <button onClick={applyLink} className={styles.linkButton} type="button">
            {isLinkActive ? 'Update' : 'Add'}
          </button>
          {isLinkActive && (
            <button onClick={removeLink} className={styles.linkButton} type="button">
              Remove
            </button>
          )}
          <button
            onClick={() => {
              setShowLinkInput(false);
              setLinkUrl('');
            }}
            className={styles.linkButton}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Editor Content */}
      <EditorContent
        editor={editor}
        className={styles.content}
        onScroll={() => {
          setHoverLink(null);
          hoverAnchorRef.current = null;
        }}
      />

      {/* Actions */}
      <div className={styles.actions}>
        <button onClick={onCancel} className={styles.cancelButton} disabled={saving}>
          Cancel
        </button>
        <button onClick={handleSave} className={styles.saveButton} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
