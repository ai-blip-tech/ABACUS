"""DXF serialization comparison only; not a geometry/topology validator."""
import collections
import decimal
import hashlib
import json
import pathlib
import re
import sys

def fingerprint(data):
    try:
        text = data.decode('utf-8', errors='strict')
    except UnicodeDecodeError:
        if b'ANSI_1251' not in data:
            raise
        text = data.decode('cp1251', errors='strict')
    rows = text.splitlines()
    if len(rows) % 2:
        raise ValueError('Incomplete DXF pair')
    canonical = []
    numbers = []
    strings = []
    codes = collections.Counter()
    for i in range(0, len(rows), 2):
        code, value = str(int(rows[i])), rows[i+1].strip()
        codes[code] += 1
        if re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', value):
            number = decimal.Decimal(value)
            with decimal.localcontext() as context:
                context.prec = 80
                number = number.quantize(decimal.Decimal('0.000001'))
            value = format(number.normalize(), 'f') if number else '0'
            numbers.append(code+'='+value)
        else:
            strings.append(code+'='+value)
        canonical.append(code+'='+value)
    digest = lambda values: hashlib.sha256('\n'.join(values).encode()).hexdigest()
    return {'bytes':len(data),'pairs':len(canonical),'canonical_sha256':digest(canonical),
            'numeric_sha256':digest(numbers),'string_sha256':digest(strings),
            'code_counts':dict(codes)}

if __name__ == '__main__':
    print(json.dumps(fingerprint(pathlib.Path(sys.argv[1]).read_bytes()),sort_keys=True))
