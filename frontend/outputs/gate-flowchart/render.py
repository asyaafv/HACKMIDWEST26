"""Render Gate's 10-second, 1080p flowchart. Requires Pillow and imageio-ffmpeg.
Run: python render.py. Pass --preview to render only the final poster.
"""
from pathlib import Path
from functools import lru_cache
import math
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

OUT = Path(__file__).resolve().parent
W, H, FPS, DURATION = 1920, 1080, 30, 10
BG = '#1d1e22'
WHITE = '#f4f4f5'
MUTED = '#b8b8be'
PEACH = '#efa36d'
SAGE = '#acc6b4'
FONT = '/System/Library/Fonts/Avenir Next.ttc'

@lru_cache(None)
def font(size, bold=False):
    return ImageFont.truetype(FONT, size, index=2 if bold else 7)

def ease(v):
    v = max(0, min(1, v))
    return 1-(1-v)**3

def text(d, xy, value, size=32, color=WHITE, bold=False, anchor='la'):
    d.text(xy, value, font=font(size,bold), fill=color, anchor=anchor)

def icon(d, x, y, kind, color):
    if kind == 'gate':
        for offset in [0, 12, 24]:
            d.rounded_rectangle((x+offset,y,x+offset+5,y+32),radius=2,fill=color)
        d.line((x,y,x+29,y), fill=color,width=5)
    elif kind == 'check':
        d.line([(x,y+17),(x+11,y+28),(x+33,y+4)],fill=color,width=5)
    elif kind == 'review':
        d.ellipse((x+7,y-1,x+25,y+17),outline=color,width=3)
        d.arc((x-2,y+19,x+34,y+47),180,360,fill=color,width=3)
    elif kind == 'concern':
        d.rounded_rectangle((x,y-2,x+32,y+32),radius=8,outline=color,width=3)
        d.line((x+16,y+5,x+16,y+17),fill=color,width=3)
        d.ellipse((x+14,y+23,x+18,y+27),fill=color)
    elif kind == 'context':
        d.rounded_rectangle((x,y-2,x+27,y+32),radius=3,outline=color,width=3)
        for offset in [8,16,24]:
            d.line((x+7,y+offset,x+20,y+offset),fill=color,width=2)

def node(frame, t, start, box, label, lines, kind, accent=PEACH, fill='#292a2f', sizes=None):
    p=ease((t-start)/.48)
    if not p: return
    layer=Image.new('RGBA',(W,H))
    d=ImageDraw.Draw(layer)
    x,y,w,h=box
    y+=round((1-p)*14)
    d.rounded_rectangle((x,y,x+w,y+h),radius=19,fill=fill,outline='#505055',width=2)
    d.rounded_rectangle((x+1,y+24,x+5,y+h-24),radius=2,fill=accent)
    d.rounded_rectangle((x+28,y+29,x+94,y+95),radius=15,fill='#34353a')
    icon(d,x+45,y+46,kind,accent)
    text(d,(x+121,y+24),label,19,accent,True)
    for i,line in enumerate(lines):
        text(d,(x+120,y+57+i*41),line, sizes or 33,WHITE,True)
    layer.putalpha(layer.getchannel('A').point(lambda a:round(a*p)))
    frame.alpha_composite(layer)

def partial_points(points, fraction):
    lengths=[math.dist(a,b) for a,b in zip(points,points[1:])]
    remaining=sum(lengths)*fraction
    result=[points[0]]
    for a,b,length in zip(points,points[1:],lengths):
        if remaining>=length:
            result.append(b); remaining-=length
        else:
            result.append((a[0]+(b[0]-a[0])*remaining/length,a[1]+(b[1]-a[1])*remaining/length))
            break
    return result

def connector(frame,t,start,duration,points,color,arrow=True):
    p=ease((t-start)/duration)
    if p<=0:return
    d=ImageDraw.Draw(frame)
    drawn=partial_points(points,p)
    d.line(drawn,fill=color,width=4,joint='curve')
    if p<1:
        x,y=drawn[-1]
        d.ellipse((x-9,y-9,x+9,y+9),fill=color)
    elif arrow:
        x,y=points[-1];a,b=points[-2]
        angle=math.atan2(y-b,x-a)
        verts=[(x,y),(x-13*math.cos(angle)+7*math.sin(angle),y-13*math.sin(angle)-7*math.cos(angle)),(x-13*math.cos(angle)-7*math.sin(angle),y-13*math.sin(angle)+7*math.cos(angle))]
        d.polygon(verts,fill=color)

def caption(frame,t,start,xy,value,color):
    p=ease((t-start)/.3)
    if p<=0:return
    layer=Image.new('RGBA',(W,H));d=ImageDraw.Draw(layer)
    x,y=xy
    bounds=d.textbbox((x,y),value,font=font(23,True),anchor='mm')
    d.rectangle((bounds[0]-15,bounds[1]-10,bounds[2]+15,bounds[3]+10),fill=BG)
    text(d,xy,value,23,color,True,'mm')
    layer.putalpha(layer.getchannel('A').point(lambda a:round(a*p)))
    frame.alpha_composite(layer)

def render(t):
    frame=Image.new('RGBA',(W,H),BG)
    d=ImageDraw.Draw(frame)
    # Fine static registration dots keep the composition quiet and dimensional.
    for x in range(70,W,40):
        for y in range(165,H-40,40):
            d.ellipse((x,y,x+1,y+1),fill='#303136')
    icon(d,92,63,'gate',PEACH)
    text(d,(141,51),'Gate',40,WHITE,True)
    text(d,(1828,71),'REQUEST / RESOLUTION',19,MUTED,True,'ra')
    d.line((92,128,1828,128),fill='#45454a',width=1)
    text(d,(980,207),'Every request.',46,WHITE,True)
    text(d,(980,263),'The right path.',46,PEACH,True)
    # Connectors are drawn beneath boxes; routing preserves two distinct columns.
    connector(frame,t,.75,.65,[(470,331),(470,405)],PEACH)
    connector(frame,t,2.1,.85,[(470,551),(470,681)],SAGE)
    caption(frame,t,2.2,(470,609),'Meets the requirements',SAGE)
    connector(frame,t,3.1,.7,[(825,478),(1065,478)],PEACH)
    caption(frame,t,3.25,(945,445),'OR',MUTED)
    connector(frame,t,4.5,.7,[(1420,551),(1420,681)],PEACH)
    connector(frame,t,5.75,.8,[(470,805),(470,859),(960,859)],SAGE,False)
    connector(frame,t,5.75,.8,[(1420,805),(1420,859),(960,859)],PEACH,False)
    connector(frame,t,6.5,.35,[(960,859),(960,913)],PEACH)
    node(frame,t,0,(115,185,710,146),'THE CONTEXT',['Company context','& purchasing policies'],'context')
    node(frame,t,1.25,(115,405,710,146),'THE ASSESSMENT',['Gate assesses the request'],'gate',sizes=34)
    node(frame,t,2.8,(115,681,710,124),'AUTOMATIC PATH',['Approved automatically'],'check',SAGE,'#27322d',sizes=33)
    node(frame,t,3.7,(1065,405,710,146),'THE EXCEPTION',['Concern identified','or insufficient evidence'],'concern',sizes=32)
    node(frame,t,5.0,(1065,681,710,124),'HUMAN PATH',['Flagged for human review'],'review',PEACH,'#372e29',sizes=31)
    node(frame,t,6.65,(605,913,710,118),'THE OUTCOME',['Request resolved'],'check',SAGE,'#27322d',sizes=34)
    return frame.convert('RGB')

if __name__ == '__main__':
    render(9).save(OUT/'gate-flowchart-poster.png')
    if '--preview' in sys.argv:sys.exit()
    binary=imageio_ffmpeg.get_ffmpeg_exe()
    cmd=[binary,'-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'gate-flowchart.mp4')]
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    for n in range(FPS*DURATION):
        process.stdin.write(render(n/FPS).tobytes())
        if n%60==0:print(f'Rendered {n}/{FPS*DURATION} frames',flush=True)
    process.stdin.close()
    err=process.stderr.read().decode()
    if process.wait():raise RuntimeError(err)
    print('Rendered 300 frames: 1920 × 1080, 30 fps, exactly 10 seconds.')
