"""Agregação municipal de recursos, com cobertura explícita e sem imputar zeros."""
from collections import defaultdict
from decimal import Decimal

MEASURES = ("allocated_brl", "committed_brl", "paid_in_period_brl")


def municipal_resources(summary, amendments, normalize):
    """Liga somente município explícito de SP; não reparte localidades múltiplas.

    O chamador fornece a normalização canônica usada no vínculo TSE/IBGE.
    Pagamentos federais são localizados pelo favorecido, sem presumir aplicação.
    Valores ausentes continuam nulos, inclusive em municípios com outros registros.
    """
    municipalities = {}
    for row in summary:
        key = normalize(row["municipality"])
        identity = (row["municipality_id"], row["municipality"])
        if key in municipalities and municipalities[key][0] != identity[0]:
            raise ValueError("Colisão de município na comparação territorial")
        municipalities[key] = identity

    totals, coverage = {}, {}
    for row in amendments:
        person, exercise = row["person"], int(row["exercise"])
        identity = municipalities.get(normalize(row["municipality"]))
        reason = "fora_sp" if row.get("uf") != "SP" else "municipio_nao_identificado"
        matched = row.get("uf") == "SP" and identity is not None
        for measure in MEASURES:
            value = row.get(measure)
            # Parcelas federais não podem repetir o principal da emenda.
            if value is None or (row.get("record_type") == "pagamento" and measure != "paid_in_period_brl"):
                continue
            amount = Decimal(str(value))
            key = (person, exercise, measure)
            audit = coverage.setdefault(key, {
                "person": person, "exercise": exercise, "measure": measure,
                "matched_records": 0, "excluded_records": 0,
                "matched_brl": Decimal(0), "excluded_brl": Decimal(0),
                "reasons": defaultdict(int),
            })
            if not matched:
                audit["excluded_records"] += 1
                audit["excluded_brl"] += amount
                audit["reasons"][reason] += 1
                continue
            audit["matched_records"] += 1
            audit["matched_brl"] += amount
            key = (person, exercise, identity[0])
            target = totals.setdefault(key, {
                "person": person, "exercise": exercise,
                "municipality_id": identity[0], "municipality": identity[1],
                **{name: None for name in MEASURES},
                **{name + "_records": 0 for name in MEASURES},
            })
            target[measure] = (target[measure] or Decimal(0)) + amount
            target[measure + "_records"] += 1

    def serializable(row):
        return {key: float(value) if isinstance(value, Decimal) else
                dict(value) if isinstance(value, defaultdict) else value
                for key, value in row.items()}

    return {
        "rows": [serializable(totals[key]) for key in sorted(totals)],
        "coverage": [serializable(coverage[key]) for key in sorted(coverage)],
    }
