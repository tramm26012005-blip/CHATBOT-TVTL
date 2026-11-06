"""Build original ambient arrangements, preserving licensed field recordings. No paid API."""
import json
from pathlib import Path
import wave
import numpy as np
root = Path(__file__).resolve().parents[1]
out = root / 'public' / 'audio'
out.mkdir(exist_ok=True)
rate, seconds = 22050, 24
t = np.arange(rate * seconds) / rate
fade = np.minimum(1, np.minimum(t / .5, (seconds - t) / .5))
groups = [
 ('Thư giãn', ['Tiếng mưa bình yên','Âm thanh sóng biển','Mưa nhẹ bên hiên','Gió chiều êm dịu','Bên dòng suối nhỏ','Khoảng trời yên tĩnh','Làn mây thong dong','Sáng sớm bình yên','Chiều bên cửa sổ','Một phút thảnh thơi'],0),
 ('Giảm căng thẳng',['Âm thanh rừng xanh','Thả lỏng đôi vai','Sau một ngày dài','Gió qua tán lá','Khoảng lặng dịu êm','Chậm lại một chút','Bình yên trong mưa','Đường về nhẹ tênh','Chiều không vội vã','Nhẹ nhàng buông xuống'],4),
 ('Tập trung',['Lofi học tập','Góc bàn buổi sáng','Trang sách đang mở','Một giờ viết lách','Nhịp học nhẹ nhàng','Bên tách trà ấm','Từng dòng ghi chú','Ánh đèn thư viện','Dòng suy nghĩ êm','Buổi học bình yên'],1),
 ('Dễ ngủ',['Giấc ngủ an yên','Đêm trời dịu mát','Mây trôi bên trăng','Lời ru không lời','Sau khung cửa đêm','Ánh sao lặng lẽ','Đêm mưa rất khẽ','Khoảng tối bình yên','Gió đêm thì thầm','Nghỉ ngơi thôi nhé'],3),
 ('Chữa lành',['Dịu dàng với mình','Một cái ôm ấm áp','Lắng nghe lòng mình','Ngày mai bước tiếp','Thương mình một chút','Bình yên trở lại','Khoảng lặng cho bạn','Ánh nắng sau mưa','Cảm xúc được lắng nghe','Chậm rãi hồi phục'],2),
 ('Tích cực',['Những ngày tích cực','Chào ngày mới','Nắng qua khung cửa','Một niềm vui nhỏ','Bắt đầu thật nhẹ','Bước chân hân hoan','Sắc màu buổi sáng','Giai điệu mỉm cười','Ngày đầy hy vọng','Mang theo ánh nắng'],5),
]
legacy = {(0,0):'rain',(0,1):'ocean',(1,0):'forest',(2,0):'lofi',(3,0):'sleep',(5,0):'positive'}
rows=[]
for group,(category,names,cover) in enumerate(groups):
 for variant,title in enumerate(names):
  rng=np.random.default_rng(2140+group*100+variant)
  white=rng.uniform(-1,1,len(t))
  # Smooth the noise for softer environmental textures.
  brown=np.convolve(white,np.ones(65+variant*6)/(65+variant*6),mode='same')
  # Each arrangement has its own score, rhythm, instrumentation and texture.
  # Environmental tracks use event-based textures, not a shared noise preset.
  def noise(width):
   return np.convolve(rng.normal(0,1,len(t)),np.ones(width)/width,mode='same')
  def events(times, freq, length, amplitude, instrument='piano'):
   result=np.zeros_like(t)
   for j,start in enumerate(times):
    first=int(start*rate); count=min(int(length*rate),len(t)-first)
    if count<=0: continue
    age=np.arange(count)/rate; f=float(freq[j%len(freq)])
    attack=1-np.exp(-age/0.012)
    if instrument=='bell':
     note=sum(w*np.sin(2*np.pi*f*r*age)*np.exp(-age*d) for r,w,d in [(1,1,1.5),(2.76,.3,3),(5.4,.12,5)])
    elif instrument=='pluck':
     note=sum(np.sin(2*np.pi*f*h*age)/h**1.7 for h in range(1,7))*np.exp(-age*5)
    elif instrument=='pad':
     note=(np.sin(2*np.pi*f*age)+.25*np.sin(2*np.pi*f*1.003*age))*np.sin(np.pi*np.minimum(age/length,1))**2
    else:
     note=sum(np.sin(2*np.pi*f*h*age)*np.exp(-age*(1.3+h*.55))/h**1.6 for h in range(1,6))
    result[first:first+count]+=amplitude*attack*note
   return result
  def rain(light=False):
   y=(.018 if light else .055)*white+(.22 if light else .45)*noise(9)
   # Individual drops, with randomly spaced attacks and resonant decays.
   for start in rng.uniform(0,seconds,90 if light else 230):
    first=int(start*rate); n=min(1800,len(t)-first); age=np.arange(n)/rate
    y[first:first+n]+=.055*np.exp(-age*90)*np.sin(2*np.pi*rng.uniform(650,2400)*age)
   return y
  def wind():
   gust=(.35+.3*np.sin(t*(.29+variant*.017))+.2*np.sin(t*.83+variant))
   return noise(100)*gust*1.1+noise(13)*.035
  def birds():
   y=wind()*.25
   for start in rng.uniform(.3,seconds-1,20):
    first=int(start*rate); n=int(rate*.22); age=np.arange(n)/rate
    y[first:first+n]+=.045*np.sin(np.pi*age/.22)**2*np.sin(2*np.pi*(rng.uniform(1900,3300)*age+1800*age**2))
   return y
  environmental = {(0,0):'rain',(0,1):'ocean',(0,2):'drizzle',(0,3):'wind',(0,4):'stream',(0,7):'birds',(1,0):'birds',(1,3):'wind',(1,6):'rain',(3,6):'drizzle',(3,8):'wind'}
  kind=environmental.get((group,variant))
  if kind=='rain': y=rain()
  elif kind=='drizzle': y=rain(True)
  elif kind=='wind': y=wind()
  elif kind=='birds': y=birds()
  elif kind=='ocean':
   swell=(.5+.5*np.sin(2*np.pi*t/7.4))**2
   y=(.07*white+.65*noise(19))*swell+.6*noise(220)*(.4+swell)
  elif kind=='stream':
   y=.08*white+.25*noise(7)
   for f in [280,460,710,1200]: y+=.012*np.sin(2*np.pi*f*t+3*np.sin(t*(3+f/270)))*(.5+.5*np.sin(t*f/69))
  else:
   # Reproducible independent melodies and chord orders for all music tracks.
   bpm=[62,56,74,42,52,98][group]+int(rng.integers(-8,9))
   beat=60/bpm; scale=np.array([0,2,4,7,9]) if group==5 else np.array([0,2,3,5,7,10])
   root_note=[48,45,48,41,48,53][group]+int(rng.integers(0,7))
   def hz(notes): return 440*2**((np.array(notes)-69)/12)
   progression=rng.permutation([0,3,5,7]); y=np.zeros_like(t)
   for bar,start in enumerate(np.arange(0,seconds,beat*4)):
    base=root_note+progression[bar%4]
    y+=events([start]*3,hz([base,base+3 if group!=5 else base+4,base+7]),beat*4,.028,'pad')
   spacing=beat*([1.5,2,1,3,2,.5][group])
   starts=np.arange(.15,seconds,spacing)
   melody=root_note+12+scale[rng.integers(0,len(scale),len(starts))]
   instrument=['bell','pluck','piano','bell','piano','pluck'][group]
   y+=events(starts,hz(melody),min(4,spacing*2),.085 if group!=3 else .045,instrument)
   if group in (2,5):
    # Warm bass plus kick, snare and closed hi-hat distinguish lofi / upbeat tracks.
    y+=events(np.arange(0,seconds,beat*2),hz([root_note-12,root_note-5,root_note-9,root_note-7]),beat*1.4,.065,'pluck')
    for j,start in enumerate(np.arange(0,seconds,beat)):
     first=int(start*rate); n=min(int(.18*rate),len(t)-first); age=np.arange(n)/rate
     kick=.11*np.sin(2*np.pi*(52*age+5*(1-np.exp(-age*35))))*np.exp(-age*27)
     snare=.035*rng.normal(0,1,n)*np.exp(-age*38)
     y[first:first+n]+=kick if j%2==0 else snare
    for start in np.arange(beat/2,seconds,beat/2):
     first=int(start*rate); n=min(int(.06*rate),len(t)-first); age=np.arange(n)/rate
     y[first:first+n]+=.012*rng.normal(0,1,n)*np.exp(-age*95)
   if group==3: y+=noise(180)*.04
  y=np.clip(y*fade,-.8,.8)
  name=legacy.get((group,variant),f'ambient-{group+1}-{variant+1:02d}')
  with wave.open(str(out/(name+'-v2.wav')),'wb') as audio:
   audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(rate);audio.writeframes((y*32767).astype('<i2').tobytes())
  rows.append(dict(id='builtin-'+name,title=title,sound_kind=kind or instrument,description=['Không gian âm thanh dịu nhẹ để nghỉ ngơi.','Giai điệu chậm cho những lúc cần thả lỏng.','Nhạc nền nhẹ cho học tập và đọc sách.','Âm thanh êm dịu trước giờ nghỉ.','Một khoảng lặng để quan tâm chính mình.','Giai điệu tươi sáng cho ngày mới.'][group],category=category,cover=cover,source_type='audio',url='/audio/'+name+'-v2.wav',builtin=True,duration_seconds=seconds,rights_note='Âm thanh tổng hợp nguyên bản của ứng dụng; đoạn 24 giây phát lặp.'))
 for row_index, row in enumerate(rows[-10:]):
  row['cover_atlas'] = '/images/music-covers/' + ['relax','stress','focus','sleep','healing','positive'][group] + '.png'
  row['cover_position'] = str(.5 if row_index % 2 == 0 else 99.5) + '% ' + str([2.44,26.22,50,73.78,97.56][row_index // 2]) + '%'
 print(category,': 10 tracks',flush=True)
# Preserve licensed local recordings whenever rebuilding the musical arrangements.
recordings_path=root/'src'/'lib'/'healing-recordings.json'
if recordings_path.exists():
 recordings=json.loads(recordings_path.read_text(encoding='utf-8'))
 for row in rows: row.update(recordings.get(row['id'],{}))
(root/'src'/'lib'/'healing-offline-library.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print('60 original tracks ready.')
