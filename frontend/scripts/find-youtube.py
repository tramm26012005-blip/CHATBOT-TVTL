"""Curate unique YouTube sources. Uses official search/oEmbed; never downloads audio."""
import concurrent.futures,json,re,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
HEADERS={'User-Agent':'Mozilla/5.0'}
def get(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=25) as r: return r.read().decode('utf-8')
def walk(x):
 if isinstance(x,dict):
  if 'videoRenderer' in x: yield x['videoRenderer']
  for y in x.values(): yield from walk(y)
 elif isinstance(x,list):
  for y in x: yield from walk(y)
def text(v): return v.get('simpleText','') or ''.join(x.get('text','') for x in v.get('runs',[]))
def search(query):
 raw=get('https://www.youtube.com/results?'+urllib.parse.urlencode({'search_query':query,'hl':'en'}))
 m=re.search(r'(?:var\s+)?ytInitialData\s*=\s*',raw)
 if not m: raise RuntimeError('YouTube search unavailable: '+query)
 data=json.JSONDecoder().raw_decode(raw[m.end():])[0]; videos=[]
 for v in walk(data):
  title=text(v.get('title',{})); duration=text(v.get('lengthText',{}))
  if not duration or re.search(r'heavy|thunder|dark|scary|sad|depress|binaural|432|528|subliminal',title,re.I): continue
  parts=duration.split(':')
  try: seconds=sum(int(n)*60**i for i,n in enumerate(reversed(parts)))
  except ValueError: continue
  if seconds<120: continue
  videos.append(dict(video_id=v['videoId'],source_title=title,channel=text(v.get('ownerText',{})),duration_seconds=seconds))
 return videos
queries=[
 'gentle light rain no thunder The Relaxed Guy',
 'gentle ocean waves relaxing nature sounds no music',
 'gentle wind leaves soft breeze nature sounds',
 'gentle stream water birds forest nature sounds',
 'gentle soft piano guitar relaxing Soothing Relaxation',
 'peaceful relaxing nature birds forest sounds no music',
 'gentle calm acoustic lofi study no vocals',
 'soft peaceful piano study music relaxing',
 'soft gentle sleep piano music Soothing Relaxation',
 'peaceful soft sleep music piano Peder Helland',
 'gentle warm relaxing piano music Peder Helland',
 'soft acoustic guitar peaceful relaxing music',
 'gentle happy morning acoustic instrumental music',
 'beautiful relaxing morning piano guitar birds Peder Helland',
]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 results=list(pool.map(search,queries))
print('Search candidates:',[len(x) for x in results],flush=True)
rows=json.loads((ROOT/'src/lib/healing-library.json').read_text(encoding='utf-8')); used=set()
def verified(v):
 url='https://www.youtube.com/watch?v='+v['video_id']
 try:
  meta=json.loads(get('https://www.youtube.com/oembed?'+urllib.parse.urlencode({'url':url,'format':'json'})))
  if '<iframe' not in meta.get('html',''): return None
  return dict(v,url=url,channel=meta['author_name'],source_title=meta['title'],channel_url=meta['author_url'])
 except Exception: return None
# Validate only candidates needed for each slot, falling back within its semantic group.
slot_queries={0:[0],1:[1],2:[0],3:[2],4:[3],5:[4],6:[4],7:[3],8:[4],9:[4]}
pools={1:[5,4],2:[6,7],3:[8,9],4:[10,11],5:[12,13]}
for index,row in enumerate(rows):
 group=index//10; variant=index%10; choice=None
 for qi in ({(1,3):[2],(1,6):[0],(3,8):[2],(5,9):[13]}.get((group,variant), slot_queries[variant] if group==0 else pools[group])):
  for candidate in results[qi]:
   if candidate['video_id'] in used: continue
   choice=verified(candidate)
   if choice: break
  if choice: break
 if not choice: raise RuntimeError('No verified distinct source for '+row['title'])
 used.add(choice['video_id'])
 row.update(choice); row.update(source_type='youtube',builtin=False,curated=True,rights_note='YouTube · '+choice['channel']+' · '+choice['source_title']+'. Phát qua trình phát YouTube chính thức; quyền nội dung thuộc tác giả.',duration_minutes=round(choice['duration_seconds']/60))
 row.pop('sound_kind',None)
 row['description']=['Tiếng thiên nhiên và giai điệu nhẹ để thảnh thơi.','Âm thanh êm dịu cho một khoảng nghỉ.','Nhạc nền không lời, nhịp nhẹ cho học tập.','Giai điệu chậm, dịu nhẹ trước giờ nghỉ.','Một bản nhạc ấm áp để lắng nghe chính mình.','Giai điệu trong trẻo để bắt đầu nhẹ nhàng.'][group]
 print(index+1,row['title'],'->',choice['source_title'],flush=True)
(ROOT/'src/lib/healing-library.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print('Saved 60 unique YouTube sources with official oEmbed metadata.',flush=True)
