import { useMemo, useState } from 'react';
import { useAdminInviteCodes } from '../../../hooks/useAdminInviteCodes';
import { Btn } from '../../primitives/Btn';
import { GenerateCodeModal } from '../GenerateCodeModal';
import { api } from '../../../lib/api';
import type { AdminInviteCode } from '@hoard/types';
import { EmptyLine, ErrorBlock, LoadingLine, SectionHeader } from './shared';

// /admin/codes — invite-code list w/ the [+ generate code] CTA (moved
// here from the top of the page per the admin-IA redesign — CTA lives
// where its output goes). Each unused row exposes [revoke]; used rows
// stay as-is.

export function AdminCodes() {
  const { data, loading, error } = useAdminInviteCodes();
  const codes = useMemo(() => data?.codes ?? [], [data]);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateNote, setGenerateNote] = useState<string>('');

  const openGenerate = (note?: string) => {
    setGenerateNote(note ?? '');
    setGenerateOpen(true);
  };
  const closeGenerate = () => {
    setGenerateOpen(false);
    setGenerateNote('');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
        <SectionHeader label="invite codes" count={codes.length} />
        <Btn variant="primary" onClick={() => openGenerate()}>+ generate code</Btn>
      </div>

      {loading && codes.length === 0 ? (
        <LoadingLine />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : codes.length === 0 ? (
        <EmptyLine text="// no invite codes yet" />
      ) : (
        <div>
          {codes.map((c) => <CodeRow key={c.id} code={c} />)}
        </div>
      )}

      {generateOpen && (
        <GenerateCodeModal initialNote={generateNote} onClose={closeGenerate} />
      )}
    </div>
  );
}

function CodeRow({ code }: { code: AdminInviteCode }) {
  const used = code.usedAt !== null;
  const usedAt = used ? new Date(code.usedAt!).toISOString().slice(0, 10) : '';

  const handleRevoke = async () => {
    if (!window.confirm(`Revoke ${code.code}? This can't be undone.`)) return;
    try {
      await api.admin.deleteInviteCode(code.id);
    } catch (err) {
      console.error('[admin] revoke failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to revoke code');
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns:
          '180px minmax(120px, 1fr) minmax(240px, 2fr) 110px',
        alignItems: 'baseline',
        padding: '6px 0',
        borderBottom: '1px dashed var(--rule)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--mono)',
        gap: 12,
      }}
    >
      <code style={{ color: 'var(--paper)', letterSpacing: '0.04em' }}>{code.code}</code>
      <span className="t-faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {code.note ?? '(no note)'}
      </span>
      <span
        className="t-faint"
        style={{
          fontSize: 'var(--text-3xs)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {used ? `used by ${code.usedBy?.displayIdentity ?? '?'} · ${usedAt}` : 'unused'}
      </span>
      <span style={{ textAlign: 'right' }}>
        {!used && (
          <button
            type="button"
            onClick={() => void handleRevoke()}
            className="t-mono"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 'var(--text-3xs)', color: 'var(--red)',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              padding: 4,
            }}
          >
            [revoke]
          </button>
        )}
      </span>
    </div>
  );
}

export default AdminCodes;
