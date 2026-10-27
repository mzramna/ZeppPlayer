"""Confere que o .zab gerado pelo zeus build inclui o Amazfit Balance (uso: python3 -I scripts/check_zab.py dist/x.zab).

O .zab é um zip com pacotes zip aninhados; procura deviceSource em todo JSON dentro dele.
"""
import io, json, re, sys, zipfile

BALANCE = {8519936, 8519937, 8519939}  # deviceSource do Amazfit Balance (docs Zepp, device-list)


def sources(data, path='', names=None):
    found = set()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            blob = z.read(name)
            if names is not None:
                names.append(path + name)
            if zipfile.is_zipfile(io.BytesIO(blob)):
                found |= sources(blob, f'{path}{name}/', names)
            elif name.endswith('.json'):
                found |= {int(n) for n in re.findall(rb'"deviceSource"\s*:\s*"?(\d+)', blob)}
    return found


if __name__ == '__main__':
    names = []
    found = sources(open(sys.argv[1], 'rb').read(), names=names)
    print('deviceSource no pacote:', sorted(found))
    missing = BALANCE - found
    if missing:
        print('conteúdo do pacote:', *names, sep='\n  ')
        sys.exit(f'Amazfit Balance ausente do pacote: faltam {sorted(missing)}')
    print('Amazfit Balance incluído.')
