"""Building register: parsing the public extract and joining it to solids."""

import io

import numpy as np

from geovox.gwr import GwrTable, join_buildings, parse_buildings_csv

HEADER = "EGID\tGGDENR\tGKODE\tGKODN\tGSTAT\tGKAT\tGKLAS\tGBAUJ\tGBAUP\tGAREA\tGASTW\tGEXPDAT\n"


def row(egid, e, n, stat=1004, kat=1020, klas=1122, year="", period="", area="", floors="", date="2026-10-21"):
    return f"{egid}\t5586\t{e}\t{n}\t{stat}\t{kat}\t{klas}\t{year}\t{period}\t{area}\t{floors}\t{date}\n"


def test_parse_keeps_existing_buildings_and_resolves_the_era():
    text = HEADER + "".join(
        [
            row(1, 2538010.5, 1152010.5, year="1897", area="300", floors="5"),
            row(2, 2538020.0, 1152020.0, period="8014"),  # 1961-1970, no exact year
            row(3, 2538030.0, 1152030.0, stat=1007),  # demolished
            row(4, "", "", year="2001"),  # no coordinates
            row(5, 2538040.0, 1152040.0, stat=1003, year="2026", klas=1220),  # under construction
            row(6, 2538050.0, 1152050.0, year="12", period="8011"),  # implausible year: the period wins
        ]
    )
    table, exported = parse_buildings_csv(io.StringIO(text))
    assert exported == "2026-10-21"
    assert len(table) == 4
    assert table.year.tolist() == [1897, 1965, 2026, 1890]
    assert table.klass.tolist() == [1122, 1122, 1220, 1122]
    assert table.area.tolist() == [300, 0, 0, 0] and table.floors[0] == 5


def table(points):
    arr = np.array(points, dtype=float)
    n = len(arr)
    return GwrTable(
        arr[:, 0], arr[:, 1], arr[:, 2].astype(np.int32), arr[:, 3].astype(np.int32),
        np.full(n, 1020, np.int32), np.zeros(n, np.int32), arr[:, 4].astype(np.int32),
    )


def test_join_by_footprint_with_a_small_tolerance_and_the_largest_entry():
    bounds = (0.0, 0.0, 20.0, 20.0)
    labels = np.zeros((20, 20), np.int32)
    labels[2:8, 2:8] = 1  # building 0 (rows from the north)
    labels[12:18, 12:18] = 2  # building 1
    t = table(
        [
            # e, n, year, class, area
            (5.5, 14.5, 1890, 1110, 120),  # inside building 0
            (4.5, 15.5, 1975, 1242, 20),  # also building 0, a smaller entry (garage)
            (10.5, 5.5, 2010, 1220, 500),  # 1.5 m outside building 1: nearest footprint
            (19.5, 19.5, 1950, 1122, 50),  # far from everything
        ]
    )
    joined = join_buildings(t, labels, bounds)
    assert set(joined) == {0, 1}
    assert joined[0].year == 1890 and joined[0].klass == 1110
    assert joined[1].year == 2010 and joined[1].klass == 1220
