import { useMemo, useState } from 'react';
import { useAdminUsers } from '../../../hooks/useAdminUsers';
import { Btn } from '../../primitives/Btn';
import { GenerateCodeModal } from '../GenerateCodeModal';
import type { AdminUser } from '@hoard/types';
import {
  EmptyLine,
  ErrorBlock,
  LoadingLine,
  SectionHeader,
  noteLabel,
  relativeTime,
} from './shared';

// /admin/pending — users who clicked "Request access" and are waiting
// for an invite code. Each row exposes a [generate code for X] button
// that opens GenerateCodeModal with the note pre-filled.

export function AdminPending() {
  const { data, loading, error } = useAdminUsers();
  const users = useMemo(() => data?.users ?? [], [data]);

  const pendingRequests = useMemo(
    () => users.filter((u) => u.status === 'PENDING_INVITE' && u.hasRequestedAccess),
    [users],
  );

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
      <SectionHeader label="pending access requests" count={pendingRequests.length} />
      {loading && pendingRequests.length === 0 ? (
        <LoadingLine />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : pendingRequests.length === 0 ? (
        <EmptyLine text="// no pending requests" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pendingRequests.map((u) => (
            <PendingRequestRow key={u.id} user={u} onGenerate={(note) => openGenerate(note)} />
          ))}
        </div>
      )}

      {generateOpen && (
        <GenerateCodeModal initialNote={generateNote} onClose={closeGenerate} />
      )}
    </div>
  );
}

function PendingRequestRow({
  user,
  onGenerate,
}: {
  user: AdminUser;
  onGenerate: (note: string) => void;
}) {
  const compact = noteLabel(user);
  const noteHint = `for ${compact}`;

  return (
    <div className="panel" style={{ padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <span className="t-mono" style={{ fontSize: 'var(--text-sm)', color: 'var(--paper)' }}>
          {user.displayIdentity}
        </span>
        <span className="t-mono t-faint" style={{ fontSize: 'var(--text-3xs)' }}>
          {user.accessRequestedAt ? `requested ${relativeTime(user.accessRequestedAt)}` : ''}
        </span>
      </div>
      {user.accessRequestMessage ? (
        <div
          className="t-mono"
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--paper-dim)',
            marginTop: 8,
            paddingLeft: 12,
            borderLeft: '2px solid var(--rule)',
            lineHeight: 'var(--lh-relaxed)',
            fontStyle: 'italic',
          }}
        >
          &ldquo;{user.accessRequestMessage}&rdquo;
        </div>
      ) : (
        <div
          className="t-mono t-faint"
          style={{ fontSize: 'var(--text-3xs)', marginTop: 8, paddingLeft: 12 }}
        >
          (no message)
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <Btn onClick={() => onGenerate(noteHint)}>generate code for {compact}</Btn>
      </div>
    </div>
  );
}

export default AdminPending;
