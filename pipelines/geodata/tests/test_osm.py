from geovox.osm import _COLUMN_TO_KEY


def test_promoted_tag_columns_map_back_to_osm_keys():
    # GDAL replaces ':' by '_' in column names; classification relies on real keys
    assert _COLUMN_TO_KEY["area_highway"] == "area:highway"
    assert _COLUMN_TO_KEY["diet_halal"] == "diet:halal"
    assert _COLUMN_TO_KEY["addr_street"] == "addr:street"
    assert _COLUMN_TO_KEY["highway"] == "highway"
