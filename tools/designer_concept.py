"""Original light instrument-designer concept; no copied reference geometry."""
import math

def build(svg, rect, text, line, arc):
    ink='#273444'; pale='#eef1f5'; border='#c5ccd4'
    def label(x,y,s,size=12,color=ink,anchor='start'):return text(x,y,s,size,color,anchor)
    def box(x,y,w,h,fill='white'):return rect(x,y,w,h,fill,0)
    d=box(0,0,1440,940,pale)+label(18,23,'Open Live Watch — Motor lab',14)
    d+=box(0,32,1440,28,'#dfe5eb')
    for x,s in [(18,'File'),(75,'Design'),(145,'View')]:d+=label(x,51,s,13)
    d+=box(0,61,1440,90,'#f8f9fb')
    groups=[(14,'Application',['Settings','▶ Run','Lock']), (224,'Clipboard',['Paste','Cut','Copy']), (406,'Tools',['Pointer','Text','Shapes']), (609,'Arrange',['Align','Group','Order']), (821,'Appearance',['Fill','Line','Font'])]
    for x,title,items in groups:
        d+=line(x+190,69,x+190,142,border,1)+label(x+78,141,title,10,'#657080','middle')
        for i,s in enumerate(items):
            d+=rect(x+i*61,74,55,39,'#e9eef5',3)+label(x+i*61+27,98,s,11,ink,'middle')
    d+=label(1090,101,'OPEN LIVE WATCH',23)+label(1090,125,'Original cross-platform instrument designer',12,'#657080')
    # Dockable left panes.
    d+=box(8,160,215,200)+box(8,160,215,24,'#dce4ed')+label(15,177,'Workspace Explorer')+label(196,177,'⋮ ×')
    for y,s in [(209,'▾ Motor lab'),(235,'    Overview'),(261,'    Scope'),(287,'    Memory')]:d+=label(22,y,s,13)
    d+=box(8,369,215,528)+box(8,369,215,24,'#dce4ed')+label(15,386,'Toolbox')+label(196,386,'⋮ ×')
    for y,s in [(420,'Writable Controls'),(530,'Gauges'),(672,'Charts'),(774,'Numeric / Miscellaneous')]:
        d+=box(9,y-20,213,25,'#e8edf2')+label(17,y-3,s)
    for x,y,s in [(23,456,'Slider'),(93,456,'Switch'),(156,456,'Button'),(23,495,'Bit'),(93,495,'Input'),(156,495,'Choice')]:
        d+=rect(x,y-19,53,29,'#f4f6f8',3)+label(x+26,y,s,10,ink,'middle')
    for i in range(8):
        x=34+(i%4)*51;y=563+(i//4)*51
        d+=arc(x,y,16,150,390,'#687482',4)+line(x,y,x+9,y-10,'#d92b38',2)
    for i in range(4):
        x=23+i*48;d+=box(x,694,37,35,'#f6f8fb')+line(x+3,721,x+13,704,'#1473b8',2)+line(x+13,704,x+22,715,'#1473b8',2)+line(x+22,715,x+33,699,'#1473b8',2)
    d+=label(28,810,'123.45   ●   °C   Compass',13)+label(18,872,'Drag controls onto the canvas',11,'#657080')
    # Document tabs and white freeform design surface.
    d+=box(233,160,951,30,'#dce4ed')+box(235,161,128,29)+label(247,180,'Overview  ×')+label(381,180,'Scope  ×')
    d+=box(233,191,951,511)+box(233,191,951,23,'#f4f5f7')+box(233,191,24,511,'#f4f5f7')
    for x in range(258,1184,20):d+=line(x,214,x,702,'#edf0f3',1)
    for y in range(214,702,20):d+=line(257,y,1184,y,'#edf0f3',1)
    for x in range(258,1184,100):d+=line(x,197,x,213,'#8e99a6',1)+label(x+4,207,str(x-258),9,'#657080')
    for y in range(214,702,100):d+=line(239,y,255,y,'#8e99a6',1)+label(237,y+13,str(y-214),9,'#657080')
    # Original layered instrument face, tri-color scale and needle.
    cx,cy=430,385
    for r,c in [(108,'#7c848b'),(104,'#cbd0d5'),(99,'#303940'),(95,'#11191f')]:d+=f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}"/>'
    d+=arc(cx,cy,101,205,315,'#f0f3f5',3)+arc(cx,cy,85,140,420,'#46515c',10)
    for a,b,c in [(140,325,'#36c945'),(325,378,'#f1d128'),(378,420,'#e83c38')]:d+=arc(cx,cy,85,a,b,c,8)
    for i in range(7):
        a=math.radians(140+i*280/6)
        d+=line(cx+math.cos(a)*70,cy+math.sin(a)*70,cx+math.cos(a)*78,cy+math.sin(a)*78,'white',2)
        d+=text(cx+math.cos(a)*59,cy+math.sin(a)*59+4,i*500,10,'white')
    d+=line(cx,cy,cx+54,cy-45,'#f94144',4)+f'<circle cx="{cx}" cy="{cy}" r="9" fill="#c9d0d6"/>'+text(cx,cy+26,'1,860 rpm',19,'white')+label(371,514,'Motor speed',15)
    # Selection adorners expose arbitrary geometry rather than cards.
    d+=f'<rect x="313" y="268" width="234" height="234" fill="none" stroke="#278bd1" stroke-width="1" stroke-dasharray="5 3"/>'
    for x,y in [(313,268),(430,268),(547,268),(313,385),(547,385),(313,502),(430,502),(547,502)]:d+=box(x-4,y-4,8,8,'#278bd1')
    d+=line(430,268,430,250,'#278bd1',1)+f'<circle cx="430" cy="244" r="5" fill="white" stroke="#278bd1"/>'
    d+=rect(552,286,31,144,'#e7edf3',3)
    for i,s in enumerate(['⌕','⚙','◒','⧉','×']):d+=label(567,307+i*25,s,17,ink,'middle')
    # Independent linear gauge and numeric control.
    d+=box(654,279,74,240,'#d7dde1')+box(659,284,64,230,'#fbfcfd')
    for i in range(20):
        c='#35c944' if i<14 else '#f1d128' if i<18 else '#e83c38'
        d+=box(681,490-i*10,15,8,c)
    for i in range(6):d+=label(662,493-i*40,str(i*20),10)
    d+=label(648,543,'Output (%)',14)
    d+=rect(789,287,195,54,'#68727c',4)+rect(793,291,187,46,'#141c24',2)+text(886,324,'24.08 V',26,'#98f49b')+label(805,366,'Bus voltage',14)
    d+=rect(801,400,106,39,'#bec6cc',18)+rect(805,404,98,31,'#e2e8eb',16)+f'<circle cx="878" cy="419" r="13" fill="#34be57"/>'+label(809,466,'Motor enabled',14)
    d+=line(351,614,536,614,'#838f9b',6)+rect(458,601,19,26,'#dbe0e5',2)+label(347,653,'Setpoint: 1,860 rpm',14)
    # Dockable property grid.
    d+=box(1193,160,239,542)+box(1193,160,239,24,'#dce4ed')+label(1202,177,'Properties')+label(1401,177,'⋮ ×')+label(1203,213,'Radial gauge · speed-gauge',12)
    rows=[('Binding','motor.speed'),('Source','mock-motor'),('Type','float32'),('Units','rpm'),('Minimum','0'),('Maximum','3000'),('Gain','1'),('Offset','0'),('Position','56, 54'),('Size','234 × 234'),('Rotation','0°')]
    for i,(a,b) in enumerate(rows):
        y=239+i*31;d+=box(1194,y,237,30,'#f8f9fb' if i%2==0 else 'white')+label(1202,y+20,a,11)+label(1288,y+20,b,11)
    d+=label(1203,624,'Panels can dock or float',11,'#657080')+label(1203,646,'Controls move freely',11,'#657080')
    # Bottom symbol browser with typed columns.
    d+=box(233,712,1199,185)+box(233,712,1199,24,'#dce4ed')+label(244,729,'Symbol Browser')+label(1396,729,'⋮ ×')
    d+=label(246,759,'ELF   I/O Registers   Custom Symbols',12)+rect(575,743,241,26,'#f7f9fc',2)+label(585,761,'Search symbols…',11,'#657080')
    columns=[(246,'Name'),(574,'Declared Type'),(736,'C Type'),(866,'Size'),(979,'Memory Address'),(1162,'Device / Core')]
    d+=box(234,773,1197,24,'#e8edf2')
    for x,s in columns:d+=label(x,789,s,11)
    for i,row in enumerate([['motor.speed','float','float','4','0x20000000','Simulator'],['motor.setpoint','float','float','4','0x20000004','Simulator'],['motor.enabled','bool','bool','1','0x20000008','Simulator']]):
        y=798+i*30;d+=box(234,y,1197,29,'#edf6ff' if i==0 else 'white')
        for (x,_),s in zip(columns,row):d+=label(x,y+19,s,11)
    d+=box(0,908,1440,32,'#dfe5eb')+label(14,929,'● Stopped',12,'#b12b32')+label(258,929,'Design mode · Freeform canvas · Mock target')+label(1222,929,'Zoom 100%')
    svg('dashboard-concept',d,1440,940,'concepts')
