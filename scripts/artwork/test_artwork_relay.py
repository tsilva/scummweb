"""Synthetic plan and signer checks; no provider access."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('artwork_relay', Path(__file__).with_name('artwork_relay.py'))
relay = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(relay)


class ArtworkRelayTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.active = self.root / 'active.json'
        self.active.write_text('{}')
        self.manifest = self.root / 'manifest.json'
        self.plan = {'version': 1, 'origin': relay.ORIGIN, 'baseHash': relay.digest(b'{}'), 'files': {}}
        for name, data in [('one.webp', b'first synthetic artwork'), ('two.webp', b'second synthetic artwork')]:
            sha = relay.digest(data)
            entry = {'sha256': sha, 'key': f'artwork/{sha}/{name}', 'bytes': len(data), 'contentType': 'image/webp'}
            self.plan['files']['/launcher/' + name] = entry
            p = self.root / 'objects' / entry['key']
            p.parent.mkdir(parents=True)
            p.write_bytes(data)
        self.save()

    def save(self):
        self.manifest.write_text(json.dumps(self.plan))

    def test_valid_batch_and_exact_single_object(self):
        self.assertEqual(len(relay.entries(relay.load_plan(self.manifest, self.active))), 2)
        plan = relay.load_plan(self.manifest, self.active, '/launcher/one.webp')
        self.assertEqual(list(plan['files']), ['/launcher/one.webp'])
        with self.assertRaises(ValueError):
            relay.load_plan(self.manifest, self.active, '/launcher/other.webp')

    def test_stale_base_and_changed_local_bytes_rejected_before_listen(self):
        self.active.write_text('changed')
        with self.assertRaisesRegex(ValueError, 'stale'):
            relay.load_plan(self.manifest, self.active)
        self.active.write_text('{}')
        entry = next(iter(self.plan['files'].values()))
        (self.root / 'objects' / entry['key']).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'bytes changed'):
            relay.load_plan(self.manifest, self.active)

    def test_links_anywhere_in_selected_directory_and_manifest_rejected(self):
        link = self.root / 'objects' / 'unreferenced'
        link.symlink_to(self.active)
        with self.assertRaisesRegex(ValueError, 'links'):
            relay.load_plan(self.manifest, self.active)
        link.unlink()
        alias = self.root / 'alias.json'
        alias.symlink_to(self.manifest)
        with self.assertRaisesRegex(ValueError, 'canonical'):
            relay.load_plan(alias, self.active)

    def test_single_requires_local_bytes_while_batch_can_verify_remote_objects(self):
        entry = next(iter(self.plan['files'].values()))
        (self.root / 'objects' / entry['key']).unlink()
        relay.load_plan(self.manifest, self.active)
        with self.assertRaisesRegex(ValueError, 'planned local bytes'):
            relay.load_plan(self.manifest, self.active, '/launcher/one.webp')

    def test_invalid_object_metadata_and_plan_limits(self):
        for field, value in [('bytes', True), ('bytes', relay.MAX_BYTES + 1),
                             ('key', 'games/unrelated'), ('contentType', 'image/png'), ('sha256', 'bad')]:
            plan = copy.deepcopy(self.plan)
            next(iter(plan['files'].values()))[field] = value
            with self.assertRaises(ValueError):
                relay.entries(plan)
        self.plan['version'] = True
        with self.assertRaises(ValueError):
            relay.entries(self.plan)

    def test_wrong_credentials_and_sibling_objects_never_reach_upstream(self):
        raw = json.dumps({'access_key_id': 'a' * 32, 'secret_access_key': 'b' * 64})
        policy = {'check_object': next(iter(self.plan['files'].values())), 'credential_sha256': relay.digest(raw.encode())}
        plan = relay.load_plan(self.manifest, self.active, '/launcher/one.webp')
        bridge = relay.Bridge(policy, plan)
        sibling = self.plan['files']['/launcher/two.webp']
        with patch.object(relay.urllib.request, 'build_opener') as upstream:
            with self.assertRaises(PermissionError):
                bridge.call('get', {'key': sibling['key']}, raw)
            with self.assertRaises(PermissionError):
                bridge.call('check', {}, '{}')
            with self.assertRaises(ValueError):
                bridge.call('put', {'key': next(iter(plan['files'].values()))['key'], 'body': 'Y2hhbmdlZA=='}, raw)
            upstream.assert_not_called()

    def test_check_only_mode_never_signs_an_artwork_download(self):
        raw = json.dumps({'access_key_id': 'a' * 32, 'secret_access_key': 'b' * 64})
        entry = next(iter(self.plan['files'].values()))
        bridge = relay.Bridge({'check_object': entry, 'credential_sha256': relay.digest(raw.encode())}, None)
        with patch.object(relay.urllib.request, 'build_opener') as upstream:
            with self.assertRaises(PermissionError):
                bridge.call('get', {'key': entry['key']}, raw)
            upstream.assert_not_called()


if __name__ == '__main__':
    unittest.main()
