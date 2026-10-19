"""Contratos censitários e reconciliação das respostas oficiais versionadas."""
import copy
import json
import unittest
from decimal import Decimal

from eleitoral.census import (ELECTION_CENSUS, INDICATORS, SidraTable, build_census,
                              complete_sum, load_tables, percentage, profile, sidra_number)
from eleitoral.sources import ROOT


class CensusContractTests(unittest.TestCase):
    def test_reference_years_are_explicit_and_do_not_interpolate_2026(self):
        self.assertEqual(ELECTION_CENSUS, {2018: 2010, 2022: 2022, 2026: 2022})

    def test_sidra_absolute_zero_is_distinct_from_suppression(self):
        self.assertEqual(sidra_number('-'), 0)
        self.assertEqual(sidra_number('0'), 0)
        self.assertEqual(sidra_number('12.34'), Decimal('12.34'))
        for symbol in ['X', '..', '...', '', None]:
            self.assertIsNone(sidra_number(symbol))
        for invalid in ['NaN', 'Infinity', '-1']:
            with self.assertRaises(ValueError):
                sidra_number(invalid)

    def test_rates_require_valid_denominators_and_all_age_bands(self):
        self.assertEqual(percentage(Decimal(1), Decimal(4)), 25)
        self.assertEqual(percentage(Decimal(0), Decimal(4)), 0)
        self.assertIsNone(percentage(None, Decimal(4)))
        self.assertIsNone(percentage(Decimal(1), Decimal(0)))
        self.assertIsNone(complete_sum([Decimal(1), None]))
        with self.assertRaises(ValueError):
            percentage(Decimal(5), Decimal(4))

    def test_ambiguous_cells_wrong_year_and_other_states_are_rejected(self):
        payload = [{"id": "93", "resultados": [{"classificacoes": [
            {"id": "2", "categoria": {"6794": "Total"}}], "series": [
            {"localidade": {"id": "3500105", "nome": "Adamantina - SP", "nivel": {"id": "N6"}},
             "serie": {"2022": "10"}}]}]}]
        self.assertEqual(SidraTable(payload, 2022).get('3500105', 93), 10)
        wrong_year = copy.deepcopy(payload)
        wrong_year[0]['resultados'][0]['series'][0]['serie'] = {'2010': '10'}
        outside_sp = copy.deepcopy(payload)
        outside_sp[0]['resultados'][0]['series'][0]['localidade']['id'] = '3100104'
        duplicate = copy.deepcopy(payload)
        duplicate[0]['resultados'][0]['series'] *= 2
        for invalid in [wrong_year, outside_sp, duplicate]:
            with self.assertRaises(ValueError):
                SidraTable(invalid, 2022)


class OfficialCensusSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tables, cls.sources = load_tables()
        cls.saved = json.loads((ROOT / 'data/census/indicators.json').read_text(encoding='utf-8'))
        cls.crosswalk = {r['municipality_id']: r['ibge_id'] for r in cls.saved['rows']}

    def test_snapshots_rebuild_exactly_and_cover_both_censuses(self):
        rebuilt = build_census(self.crosswalk, write_output=False)
        # As chaves dos anos se tornam strings na serialização JSON.
        self.assertEqual(json.loads(json.dumps(rebuilt)), self.saved)
        self.assertEqual(len(self.sources), 13)
        self.assertEqual(len(self.crosswalk), 645)
        self.assertEqual(len(rebuilt['rows']), 1290)
        for year in [2010, 2022]:
            rows = [r for r in rebuilt['rows'] if r['census_year'] == year]
            self.assertEqual(len({r['ibge_id'] for r in rows}), 645)
            for row in rows:
                for key, (_, unit, _, _) in INDICATORS.items():
                    self.assertIsNotNone(row[key])
                    if unit == 'percent':
                        self.assertTrue(0 <= row[key] <= 100)

    def test_municipal_universe_counts_reconcile_with_the_official_state(self):
        expected_population = {2010: 41262199, 2022: 44411238}
        for year, tables in self.tables.items():
            state = profile(tables, '35', year)
            self.assertEqual(state['population'], expected_population[year])
            rows = [profile(tables, code, year) for code in self.crosswalk.values()]
            for field in ['population', 'female_count', 'older_65_count', 'people_15_plus',
                          'literate_15_plus', 'households', 'water_network_households',
                          'sewer_network_households', 'garbage_collection_households']:
                self.assertEqual(sum(r[field] for r in rows), state[field], (year, field))

    def test_state_income_is_the_official_statistic_not_a_municipal_average(self):
        states = {r['census_year']: r for r in self.saved['states']}
        self.assertEqual(states[2010]['income_pc_mean_brl'], 1036.51)
        self.assertEqual(states[2022]['income_pc_mean_brl'], 2093.44)
        self.assertEqual(states[2022]['income_pc_median_brl'], 1250.17)
        for year in [2010, 2022]:
            values = [r['income_pc_median_brl'] for r in self.saved['rows'] if r['census_year'] == year]
            self.assertNotAlmostEqual(sum(values) / len(values), states[year]['income_pc_median_brl'], places=2)

    def test_incomplete_or_colliding_crosswalk_is_rejected(self):
        incomplete = dict(list(self.crosswalk.items())[:-1])
        collision = dict(self.crosswalk) | {'extra': next(iter(self.crosswalk.values()))}
        for invalid in [incomplete, collision]:
            with self.assertRaises(ValueError):
                build_census(invalid, write_output=False)


if __name__ == '__main__':
    unittest.main()
