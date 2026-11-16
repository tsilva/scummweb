"""Audio boundary regressions for the lossless Queen recipe; no game data."""

import struct
import unittest

from build_queen_flac import NOTICE, sound_pcm


class QueenSoundHeaders(unittest.TestCase):
    def test_native_header_lengths_preserve_all_samples(self):
        for version in (102, 104, 110, 112):
            with self.subTest(version=version):
                header = bytearray(122 if version == 110 else 110)
                struct.pack_into("<H", header, 2, version)
                pcm = bytes((0, 127, 128, 255)) * 7
                self.assertEqual(sound_pcm(header + pcm), (version, pcm))

    def test_truncated_sound_is_rejected(self):
        for data in (b"", b"x", b"\0\0\x6e\0" + bytes(106)):
            with self.assertRaises(ValueError):
                sound_pcm(data)

    def test_modified_edition_is_marked_without_replacing_original_notices(self):
        self.assertTrue(NOTICE.startswith(b"MODIFIED VERSION"))
        self.assertIn(b"Original readme, attribution and licence follow unchanged", NOTICE)


if __name__ == "__main__":
    unittest.main()
