# Clerk

The court's records beyond the casier.

- Every line said in a hearing (judge, clerk, AI lawyer, members heard by Whisper) is a `transcript_line` under the ID of the trial in progress; the finished trial is saved under that same ID with its AI case file (`summary`).
- The clerk only tells what is written: recaps come from the transcript, answers about past trials from `searchArchives` (French full-text search in Postgres, no embeddings).
- `fetchDossier` adds roles held, trials won, testimonies, courtroom incidents and memorable lines to the casier.
