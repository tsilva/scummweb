# Revised game downloads

The included catalog can select an immutable, versioned ZIP through
`data/game-downloads.json`. `catalogZipUrl` applies this selection only to the
included catalog. Custom bucket libraries retain their `<gameId>.zip` convention.

Changing a download must preserve the catalog target, native engine/game IDs,
route and save target when its game data remains save compatible. The ZIP URL
is a cache identity, not a save identity. A new filename causes a fresh download;
existing saves and cloud save paths continue to use the same target. Keep the
previous public object available for older application clients.

The bundled-file generator retains previous file signatures and fingerprints.
Both original and revised imports can therefore still be recognized as the
included game. It never deletes imported archives or their saves.

## Flight of the Amazon Queen

The English DOS CD lossless edition replaces `queen.1` with ScummVM's rebuilt
`queen.1c` format. Its 6,745 speech/sound clips decode to exactly the samples
consumed by the original engine: 8-bit mono at 11,840 Hz. All 926 other resources
are byte identical. The original licence remains intact after a prominent
modification notice, as required by its redistribution terms.

Build and verify from the checksum-pinned original download:

```sh
python3 scripts/build_queen_flac.py --source downloads/queen.zip \
  --output-dir downloads --receipt /path/outside-public/package-verification.json
```

The recipe requires FLAC 1.5.0, checks the pinned `queen.tbl`, independently
decodes every encoded clip, verifies full resource coverage and checks the
resulting ZIP. It writes a checksum-derived filename without overwriting a
different file. ZIP bytes also depend on the zlib version; the published build
uses zlib 1.2.12, recorded in its verification receipt.

The revised ZIP is 79,104,254 bytes, compared with 117,024,894 bytes originally
(32.4% smaller). Queen's target, native version and saves remain unchanged.
Original-asset saves have been checked with both Continue and manual Load using
the lossless edition. This establishes tested save compatibility, not a full
playthrough of every possible save state.

Use the [game publishing procedure](game-publishing.md) to publish and verify the
new object before deploying the catalog selection. Never overwrite `queen.zip`
or substitute an artwork publishing connection.
