"""Limites do cruzamento: município, esfera, ausência e parcelas de pagamento."""
import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from eleitoral.correlation import municipal_resources
from eleitoral.pipeline import municipality_name
from eleitoral import package as packaging


class MunicipalResourcesTests(unittest.TestCase):
    summary = [dict(municipality_id='1', municipality='PALMEIRA D OESTE'),
               dict(municipality_id='2', municipality='BAURU')]

    def row(self, **overrides):
        row = dict(person='enrico', exercise=2020, uf='SP', municipality="Palmeira d'Oeste",
                    allocated_brl=None, committed_brl=None, paid_in_period_brl=None,
                    record_type='empenho')
        return row | overrides

    def aggregate(self, rows):
        return municipal_resources(self.summary, rows, municipality_name)

    def test_only_explicit_sp_municipalities_are_joined(self):
        rows = [self.row(committed_brl=100), self.row(uf='MG', committed_brl=200),
                self.row(municipality='Múltiplo', committed_brl=300)]
        result = self.aggregate(rows)
        self.assertEqual(len(result['rows']), 1)
        self.assertEqual(result['rows'][0]['committed_brl'], 100)
        self.assertEqual(result['coverage'][0]['excluded_brl'], 500)
        self.assertEqual(result['coverage'][0]['reasons'],
                         {'fora_sp': 1, 'municipio_nao_identificado': 1})

    def test_absence_is_not_zero_and_explicit_zero_is_preserved(self):
        result = self.aggregate([self.row(committed_brl=0)])
        row = result['rows'][0]
        self.assertEqual(row['committed_brl'], 0)
        self.assertEqual(row['committed_brl_records'], 1)
        self.assertIsNone(row['allocated_brl'])
        self.assertEqual(len(result['rows']), 1)  # Bauru continua sem informação.

    def test_payment_does_not_repeat_the_commitment(self):
        payment = self.row(committed_brl=100, paid_in_period_brl=40)
        payment['record_type'] = 'pagamento'
        row = self.aggregate([self.row(committed_brl=100), payment])['rows'][0]
        self.assertEqual(row['committed_brl'], 100)
        self.assertEqual(row['paid_in_period_brl'], 40)

    def test_exercises_and_measures_remain_separate(self):
        later = self.row(committed_brl=0.2)
        later['exercise'] = 2021
        result = self.aggregate([self.row(committed_brl=0.1), self.row(committed_brl=0.2), later])
        self.assertEqual(result['rows'][0]['committed_brl'], 0.3)
        self.assertEqual(result['rows'][1]['committed_brl'], 0.2)
        json.dumps(result, allow_nan=False)

    def test_normalized_name_collision_fails(self):
        conflicting = self.summary + [dict(municipality_id='3', municipality="Palmeira d'Oeste")]
        with self.assertRaisesRegex(ValueError, 'Colisão'):
            municipal_resources(conflicting, [], municipality_name)


class SnapshotTests(unittest.TestCase):
    def test_all_local_scripts_are_embedded_in_order(self):
        temporary_root = Path(__file__).resolve().parents[1] / 'tmp/tests'
        temporary_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary_root) as directory:
            root = Path(directory)
            dist = root / 'dist'
            (dist / 'data/sections/2022').mkdir(parents=True)
            scripts = ['panels.js', 'analytics.js', 'census.js', 'features.js', 'app.js']
            html = '<link rel="stylesheet" href="style.css" /><a href="data/censos_municipios.csv" download>CSV</a>' + ''.join(f'<script src="{name}"></script>' for name in scripts)
            (dist / 'index.html').write_text(html, encoding='utf-8')
            (dist / 'style.css').write_text('body{margin:0}', encoding='utf-8')
            for name in scripts:
                (dist / name).write_text(f'/* marker:{name} */', encoding='utf-8')
            (dist / 'data/dashboard.json').write_text(json.dumps({'label': '</script>'}), encoding='utf-8')
            (dist / 'data/municipalities.geojson').write_text('{}', encoding='utf-8')
            (dist / 'data/sections/2022/1.json').write_text('[]', encoding='utf-8')
            (dist / 'data/votos_municipios.csv').write_text('year,votes\n2022,10', encoding='utf-8')
            (dist / 'data/censos_municipios.csv').write_text('census_year,population\n2022,10', encoding='utf-8')
            with patch.object(packaging, 'ROOT', root):
                result = packaging.package(github_pages=True, create_archive=False)
            output = (root / 'docs/index.html').read_text(encoding='utf-8')
            self.assertNotIn('<script src=', output)
            self.assertNotIn('href="style.css"', output)
            self.assertNotIn('href="data/censos_municipios.csv"', output)
            self.assertIn('download="censos_municipios.csv"', output)
            self.assertNotIn(b'\r\n', (root / 'docs/index.html').read_bytes())
            self.assertEqual([output.index('marker:' + name) for name in scripts],
                             sorted(output.index('marker:' + name) for name in scripts))
            self.assertIn('<\\/script>', output)
            self.assertEqual(output, (root / 'preview.html').read_text(encoding='utf-8'))
            self.assertIsNone(result['archive'])
            # A publicação recompõe a interface sem dist/ nem fontes brutas.
            web = root / 'web'
            web.mkdir()
            for name in ['index.html', 'style.css', *scripts]:
                shutil.copyfile(dist / name, web / name)
            (web / 'app.js').write_text('/* marker:app.js */\n/* interface atual */', encoding='utf-8')
            self.assertTrue(dist.resolve().is_relative_to(temporary_root.resolve()))
            shutil.rmtree(dist)
            with patch.object(packaging, 'ROOT', root):
                packaging.package(github_pages=True, create_archive=False, from_snapshot=True)
            rebuilt = (root / 'docs/index.html').read_text(encoding='utf-8')
            self.assertIn('/* interface atual */', rebuilt)
            pattern = r'<script id="embedded-data" type="application/json">(.*?)</script>'
            self.assertEqual(re.search(pattern, output).group(1), re.search(pattern, rebuilt).group(1))
            self.assertIn('download="censos_municipios.csv"', rebuilt)


if __name__ == '__main__':
    unittest.main()
