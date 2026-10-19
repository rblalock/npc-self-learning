from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json, sys
root=Path(sys.argv[1] if len(sys.argv)>1 else 'apps/microsite/dist').resolve()
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self, tag, attrs):
        for k,v in attrs:
            if k in ('href','src','poster') and v: self.links.append(v)
missing=[]; checked=0; managed=0; pages=list(root.rglob('*.html'))
for page in pages:
    p=Links();p.feed(page.read_text())
    for link in p.links:
        u=urlsplit(link)
        if u.scheme or u.netloc or not u.path:continue
        if '--allow-vercel-analytics' in sys.argv and u.path=='/_vercel/insights/script.js':
            managed+=1;continue
        path=(root/unquote(u.path.lstrip('/')) if u.path.startswith('/') else page.parent/unquote(u.path)).resolve()
        checked+=1
        if not path.exists():missing.append({'page':str(page.relative_to(root)),'link':link,'missing':str(path)})
result={'htmlPages':len(pages),'checkedLocalReferences':checked,'platformManagedAnalyticsReferences':managed,'missing':missing}
print(json.dumps(result,indent=2));sys.exit(bool(missing))
