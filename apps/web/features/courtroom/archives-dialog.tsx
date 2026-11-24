"use client";

import type { ArchiveFile } from "@tribunal/bot/room/protocol";
import { GameButton, GameDialog } from "@/components/game-ui";
import Image from "next/image";

/** The shelves of the archive cabinet: the clerk's file on every member the judge knows */
export const ArchivesDialog = ({ files, onClose }: { files: ArchiveFile[]; onClose: () => void }) => (
  <GameDialog
    title="Archives du Tribunal"
    actions={(
      <GameButton variant="neutral" onClick={onClose}>
        Fermer
      </GameButton>
    )}
  >
    {files.length === 0 ? (
      <p>Les étagères sont vides. Le greffier n'a encore rien noté sur personne.</p>
    ) : (
      <ul className="archives">
        {files.map((file) => (
          <li key={file.id} className="archive">
            {file.avatarUrl !== null && <Image className="archive-avatar" src={file.avatarUrl} alt="" width={40} height={40} unoptimized />}
            <div>
              <h3 className="archive-name">{file.name}</h3>
              <p className="archive-notes">{file.profile}</p>
            </div>
          </li>
        ))}
      </ul>
    )}
  </GameDialog>
);
