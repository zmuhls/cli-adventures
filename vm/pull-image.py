# Pull one platform's layers of a Docker Hub image (anonymous) and unpack them into a rootfs
import json, sys, urllib.request, tarfile, io, os
repo, tag, arch, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
def get(url, token, accept=None):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}', **({'Accept': accept} if accept else {})})
    return urllib.request.urlopen(req, timeout=120)
token = json.load(urllib.request.urlopen(f'https://auth.docker.io/token?service=registry.docker.io&scope=repository:{repo}:pull'))['token']
idx = json.load(get(f'https://registry-1.docker.io/v2/{repo}/manifests/{tag}', token, 'application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json'))
if 'layers' in idx:
    man, digest = idx, tag
else:
    plats = [(m['platform']['architecture'], m['platform'].get('variant'), m['digest']) for m in idx.get('manifests', [])]
    print('platforms:', [(a, v) for a, v, _ in plats if a != 'unknown'])
    digest = next(d for a, v, d in plats if a == arch)
    man = json.load(get(f'https://registry-1.docker.io/v2/{repo}/manifests/{digest}', token, 'application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json'))
os.makedirs(out, exist_ok=True)
for layer in man['layers']:
    blob = get(f'https://registry-1.docker.io/v2/{repo}/blobs/{layer["digest"]}', token).read()
    print('layer', layer['digest'][:19], len(blob), 'bytes')
    with tarfile.open(fileobj=io.BytesIO(blob), mode='r:*') as t:
        for m in t.getmembers():
            if m.name.split('/')[-1].startswith('.wh.'): continue
            if m.isdev(): continue
            try: t.extract(m, out, filter='tar')
            except Exception as e: pass
print('digest', digest)
