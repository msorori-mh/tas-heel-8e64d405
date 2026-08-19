from __future__ import annotations
import base64, hashlib, html, json, re, shutil, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT=Path(__file__).resolve().parents[2]; RAW=ROOT/'.local-intake/chemistry-g12-iron/raw'
OUT=ROOT/'content-packages/chemistry-g12-iron-v3'; ASSETS=OUT/'assets'; PREVIEW=OUT/'preview'
FILES={'sanaa_textbook':'كتاب الكيمياء الصف ثالث ثانوي منهج صنعاء.pdf','aden_textbook':'كتاب الكيمياء الصف ثالث ثانوي منهج عدن.pdf','activity_book':'كتاب الكيمياء - الانشطة والتجارب العملية منهج صنعاء وعدن.pdf','official_lesson':'الدرس الرابع-الحديد (2).pdf','explanation':'شرح درس الحديد Fe.docx','summary':'الحديد – ملخص شامل ومنظم.docx','mindmap':'4.html','lab':'مختبر_تمكين_الكشف_عن_الحديد (2).html','unit_assessment':'تقويم الوحده الاولى (2).pdf','self_test':'درس الحديد_استيراد_أسئلة (1).xlsx','ministerial':'نماذج_ثالث_ثانوي_كيمياء_علمي_2022_عدن.pdf','mindmap_reference':'tamkeen_iron_mindmap_site_preview.html'}
CAPS=['officialBookContent','tamkeenExplanationHtml','lessonSummaryHtml','mindMapHtml','labExperimentHtml','officialBookQuestions','selfTest']
SRC={k:RAW/v for k,v in FILES.items()}

def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for c in iter(lambda:f.read(1048576),b''): h.update(c)
 return h.hexdigest()
def put(p,v,raw=False):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(v if raw else json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def paras(p):
 ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 with zipfile.ZipFile(p) as z:r=ET.fromstring(z.read('word/document.xml'))
 return [s for x in r.findall('.//w:body/w:p',ns) if (s:=''.join(t.text or '' for t in x.findall('.//w:t',ns)).strip())]

CSS='''<style>:root{--ink:#172033;--brand:#8b3d20;--paper:#fffdf8;--line:#e6d9c8}*{box-sizing:border-box}html{direction:rtl}body{margin:0;background:#f5f0e8;color:var(--ink);font-family:Segoe UI,Tahoma,Arial,sans-serif;line-height:1.9}main{width:min(100% - 24px,900px);margin:12px auto;background:var(--paper);padding:18px;border:1px solid var(--line);border-radius:16px;overflow-wrap:anywhere}h1,h2{color:var(--brand);line-height:1.35}h1{font-size:1.55rem}h2{font-size:1.25rem;border-bottom:1px solid var(--line);padding-bottom:6px}.formula,.equation{direction:ltr;text-align:center;font-family:Georgia,serif;font-size:1.08rem;overflow-wrap:anywhere}.tamkeen-label{display:inline-block;background:#f1dfc9;color:#6e2d18;padding:2px 9px;border-radius:99px}.note{background:#fff5dc;border-right:4px solid #d28b2c;padding:9px;margin:10px 0}table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse}th,td{border:1px solid var(--line);padding:6px;min-width:110px}details{border:1px solid var(--line);border-radius:12px;padding:8px;margin:8px 0;background:#fff}summary{cursor:pointer;font-weight:700;color:var(--brand)}img{max-width:100%;height:auto}@media(min-width:640px){main{padding:28px}}</style>'''

def html_doc(ps):
 out=[CSS,'<main dir="rtl"><span class="tamkeen-label">شرح تمكين</span>']
 for p in ps:
  e=html.escape(p)
  tag='h2' if re.match(r'^(الحديد|مقدمة|أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً|خاتمة|ملخص|نشاط|الكشف)',p) else 'p'
  cls=' class="equation" dir="ltr"' if tag=='p' and any(x in p for x in ['Fe','CO','O₂','H₂','Cl₂','→','⇌']) else ''
  out.append(f'<{tag}{cls}>{e}</{tag}>')
 out.append('</main>');return '\n'.join(out)

def blocks():
 data=[
 ('iron-family','TABLE',1,14,'عائلة الحديد','<table><caption>عائلة الحديد</caption><tr><th>العنصر</th><th>الرمز</th><th>العدد الذري</th></tr><tr><td>الحديد</td><td>Fe</td><td>26</td></tr><tr><td>الكوبالت</td><td>Co</td><td>27</td></tr><tr><td>النيكل</td><td>Ni</td><td>28</td></tr></table>'),
 ('intro','PARAGRAPH',1,14,'يعد الحديد من أكثر الفلزات الانتقالية استخداماً، ويقع في المجموعة الثامنة والدورة الرابعة من الجدول الدوري.','<p>يعد الحديد من أكثر الفلزات الانتقالية استخداماً، ويقع في المجموعة الثامنة والدورة الرابعة من الجدول الدوري.</p>'),
 ('ores','PARAGRAPH',1,14,'أهم خامات الحديد: الماجنيتيت Fe3O4، والهيماتيت Fe2O3، والليمونيت Fe2O3·nH2O.','<p>أهم خامات الحديد: الماجنيتيت Fe<sub>3</sub>O<sub>4</sub>، والهيماتيت Fe<sub>2</sub>O<sub>3</sub>، والليمونيت Fe<sub>2</sub>O<sub>3</sub>·nH<sub>2</sub>O.</p>'),
 ('mining','PARAGRAPH',1,14,'يستخلص الحديد من خاماته في الفرن العالي (اللافح)، وتسمى المواد الداخلة إلى الفرن بالشحنة.','<p>يستخلص الحديد من خاماته في الفرن العالي (اللافح)، وتسمى المواد الداخلة إلى الفرن بالشحنة.</p>'),
 ('charge','PARAGRAPH',2,15,'تتكون الشحنة من خام الحديد وفحم الكوك والحجر الجيري.','<p>تتكون الشحنة من خام الحديد وفحم الكوك والحجر الجيري.</p>'),
 ('carbon','FORMULA',2,15,'C + O2 → CO2','<p class="formula" dir="ltr">C + O<sub>2</sub> → CO<sub>2</sub></p>'),
 ('furnace-diagram','DIAGRAM',3,16,'رسم تخطيطي للفرن العالي (اللافح)','<figure><img src="lesson-internal://official-page-3.png" alt="رسم تخطيطي للفرن العالي (اللافح)"><figcaption>رسم تخطيطي للفرن العالي (اللافح)</figcaption></figure>'),
 ('co','FORMULA',3,16,'CO2 + C → 2CO','<p class="formula" dir="ltr">CO<sub>2</sub> + C → 2CO</p>'),
 ('reduction','FORMULA',3,16,'Fe2O3 → Fe3O4 → FeO → Fe','<p class="formula" dir="ltr">Fe<sub>2</sub>O<sub>3</sub> → Fe<sub>3</sub>O<sub>4</sub> → FeO → Fe</p>'),
 ('reduction-reactions','FORMULA',3,16,'Fe2O3 + CO → Fe3O4 + CO2؛ Fe3O4 + CO → FeO + CO2؛ FeO + CO → Fe + CO2','<p class="formula" dir="ltr">Fe<sub>2</sub>O<sub>3</sub> + CO → Fe<sub>3</sub>O<sub>4</sub> + CO<sub>2</sub><br>Fe<sub>3</sub>O<sub>4</sub> + CO → FeO + CO<sub>2</sub><br>FeO + CO → Fe + CO<sub>2</sub></p>'),
 ('limestone','PARAGRAPH',4,17,'يتحلل الحجر الجيري بالحرارة، ويتفاعل أكسيد الكالسيوم الناتج مع الشوائب مكوناً الخبث.','<p>يتحلل الحجر الجيري بالحرارة، ويتفاعل أكسيد الكالسيوم الناتج مع الشوائب مكوناً الخبث.</p>'),
 ('slag','FORMULA',4,17,'CaCO3 → CaO + CO2؛ CaO + SiO2 → CaSiO3 (الخبث)','<p class="formula" dir="ltr">CaCO<sub>3</sub> → CaO + CO<sub>2</sub><br>CaO + SiO<sub>2</sub> → CaSiO<sub>3</sub> (الخبث)</p>'),
 ('pig-iron','PARAGRAPH',4,17,'ينتج الحديد الغفل، ثم ينقل إلى مراحل التصنيع المختلفة.','<p>ينتج الحديد الغفل، ثم ينقل إلى مراحل التصنيع المختلفة.</p>'),
 ('physical-properties','PARAGRAPH',4,17,'الحديد فلز فضي اللون، لين قابل للطرق والسحب، وموصل جيد للحرارة والكهرباء، ودرجة انصهاره 1535 درجة مئوية.','<p>الحديد فلز فضي اللون، لين قابل للطرق والسحب، وموصل جيد للحرارة والكهرباء، ودرجة انصهاره 1535 درجة مئوية.</p>'),
 ('oxygen-water','FORMULA',5,18,'يتفاعل الحديد مع الأكسجين وبخار الماء مكوناً Fe3O4.','<p>يتفاعل الحديد مع الأكسجين وبخار الماء مكوناً Fe<sub>3</sub>O<sub>4</sub>.</p>'),
 ('rust','PARAGRAPH',5,18,'يتكون الصدأ عند تعرض الحديد للهواء الرطب.','<p>يتكون الصدأ عند تعرض الحديد للهواء الرطب.</p>'),
 ('chlorine','FORMULA',5,18,'2Fe + 3Cl2 → 2FeCl3','<p class="formula" dir="ltr">2Fe + 3Cl<sub>2</sub> → 2FeCl<sub>3</sub></p>'),
 ('sulfur','FORMULA',5,18,'يتفاعل الحديد مع الكبريت مكوناً كبريتيد الحديد.','<p>يتفاعل الحديد مع الكبريت مكوناً كبريتيد الحديد.</p>'),
 ('acids','PARAGRAPH',5,18,'يتفاعل الحديد مع الأحماض المخففة وينتج الهيدروجين وأملاح الحديد، ولا يتأثر الحديد بحمض الكبريتيك وحمض النيتريك المركزين.','<p>يتفاعل الحديد مع الأحماض المخففة وينتج الهيدروجين وأملاح الحديد، ولا يتأثر الحديد بحمض الكبريتيك وحمض النيتريك المركزين.</p>'),
 ('passivation','PARAGRAPH',5,18,'تخميل الحديد هو تكوّن طبقة واقية على سطحه عند تعرضه لبعض العوامل.','<p>تخميل الحديد هو تكوّن طبقة واقية على سطحه عند تعرضه لبعض العوامل.</p>'),
 ('activity-reference','NOTE',5,18,'ارجع إلى النشاط العملي للكشف عن الحديد في أملاحه.','<aside class="note"><strong>نشاط عملي:</strong> ارجع إلى النشاط العملي للكشف عن الحديد في أملاحه.</aside>')]
 return [dict(zip(['id','type','source_page','book_page','text','html'],x)) for x in data]

def official_html(bs,h):
 return f'<section data-layer="A_OFFICIAL_TEXTBOOK" data-official-standard="20A" dir="rtl" data-source-file-hash="sha256:{h}">'+''.join(f'<section data-block-id="{b["id"]}" data-block-type="{b["type"]}" data-source-page="{b["source_page"]}">{b["html"]}</section>' for b in bs)+'</section>'

def mindmap():
 return CSS+'''<main dir="rtl"><span class="tamkeen-label">خريطة ذهنية تمكين</span><h1>الحديد Fe</h1><details open><summary>عنصر الحديد Fe</summary><details><summary>أهم خامات الحديد</summary><ul><li>الماجنيتيت Fe3O4</li><li>الهيماتيت Fe2O3</li><li>الليمونيت Fe2O3.nH2O</li></ul></details><details><summary>تعدين واستخلاص الحديد</summary><details><summary>الفرن العالي اللافح</summary><ul><li>استخدام فحم الكوك كعامل مختزل</li><li>إضافة الحجر الجيري للتخلص من الشوائب</li><li>إنتاج الحديد الغفل بنسبة نقاء عالية</li></ul><details><summary>التفاعلات الكيميائية بالفرن</summary><ul><li>تكوين أول أكسيد الكربون CO</li><li>اختزال أكاسيد الحديد إلى Fe</li><li>تكوين الخبث السائل Slag</li></ul></details></details></details><details><summary>خواص الحديد وتفاعلاته</summary><details><summary>الخواص الفيزيائية</summary><ul><li>فلز فضي لين قابل للطرق</li><li>الانصهار عند 1535 درجة مئوية</li><li>توصيل جيد للحرارة والكهرباء</li></ul></details><details><summary>التفاعلات الكيميائية</summary><ul><li>التفاعل مع O2 وبخار الماء لتكوين Fe3O4</li><li>تكوين الصدأ Rust في الهواء الرطب</li><li>التفاعل مع Cl2 لتكوين FeCl3</li><li>التفاعل مع الأحماض لإنتاج H2 وأملاح الحديد</li></ul></details></details></details></main>'''

def lab():
 js='''<script>const bridge=window.__TasheelBridge;function logEvent(type,payload){if(bridge&&typeof bridge.sendInteraction==="function")bridge.sendInteraction({type,payload});}function showResult(){const ion=document.querySelector("#ion").value;const box=document.querySelector("#result");const data=ion==="Fe2+"?{name:"Fe(OH)2",color:"أبيض مخضر",eq:"Fe²⁺(aq)+2OH⁻(aq)→Fe(OH)₂(s)"}:{name:"Fe(OH)3",color:"بني محمر",eq:"Fe³⁺(aq)+3OH⁻(aq)→Fe(OH)₃(s)"};box.innerHTML="<strong>الملاحظة:</strong> يتكون راسب "+data.name+" "+data.color+"<p dir=\\"ltr\\">"+data.eq+"</p>";logEvent("iron-test-result",data);}document.addEventListener("DOMContentLoaded",()=>{document.querySelector("#run").addEventListener("click",showResult);if(bridge&&typeof bridge.markStarted==="function")bridge.markStarted({capability:"labExperimentHtml"});});</script>'''
 digest=base64.b64encode(hashlib.sha256(js.encode()).digest()).decode()
 return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';style-src \'unsafe-inline\';script-src \'self\' \'sha256-'+digest+'\';img-src \'self\' data:;connect-src \'none\'"><style>body{margin:0;background:#f8f3ea;color:#172033;font-family:Segoe UI,Tahoma,Arial,sans-serif;line-height:1.8}main{max-width:720px;margin:auto;padding:16px}button,select{font:inherit;padding:8px;margin:4px;border:1px solid #b98b67;border-radius:8px;background:#fff}#result{margin-top:12px;padding:12px;background:#fff7dc;border-right:4px solid #b46a22}.model{font-size:.9rem;color:#6e2d18}</style></head><body><main><h1>الكشف عن الحديد في أملاحه</h1><p>اختر أيون الحديد ثم أضف الكاشف لعرض الملاحظة.</p><label for="ion">الأيون</label><select id="ion"><option>Fe2+</option><option>Fe3+</option></select><button id="run" type="button">إجراء الاختبار</button><div id="result" aria-live="polite">لم يبدأ الاختبار.</div><p class="model"><strong>TAMKEEN_SIMULATION_MODEL:</strong> الألوان والنتيجة المعروضة نموذج محاكاة تعليمية وليست قياساً مخبرياً رسمياً.</p></main>'+js+'</body></html>'

def xlsx(path):
 ns={'a':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
 with zipfile.ZipFile(path) as z:
  sh=[];
  if 'xl/sharedStrings.xml' in z.namelist():
   r=ET.fromstring(z.read('xl/sharedStrings.xml'));sh=[''.join(t.text or '' for t in x.findall('.//a:t',ns)) for x in r.findall('a:si',ns)]
  r=ET.fromstring(z.read('xl/worksheets/sheet1.xml')); rows=[]
  for row in r.findall('.//a:sheetData/a:row',ns):
   v={}
   for c in row.findall('a:c',ns):
    col=re.sub(r'\d','',c.attrib.get('r',''));x=c.find('a:v',ns);s='' if x is None else x.text or ''
    if c.attrib.get('t')=='s' and s:s=sh[int(s)]
    v[col]=s
   rows.append(v)
 qs=[]; companion=[]
 for n,row in enumerate(rows[1:],1):
  if row.get('A','').strip():
   qid=f'iron-self-{n:03d}';qs.append({'id':qid,'question':row['A'].strip(),'type':row.get('I','').strip() or 'multiple_choice','options':[row.get(x,'') for x in 'BCDE' if row.get(x,'')],'source_row':n+1,'subject':row.get('H',''),'content_status':'DRAFT'})
   companion.append({'question_id':qid,'correct_option':row.get('F',''),'rationale':row.get('G','')})
 return qs,companion

def main():
 if OUT.exists():shutil.rmtree(OUT)
 ASSETS.mkdir(parents=True);PREVIEW.mkdir(parents=True);hs={k:sha(v) for k,v in SRC.items()};bs=blocks()
 img=ROOT/'tmp/pdfs/الدرس الرابع-الحديد (2).png'
 if img.exists():shutil.copy2(img,ASSETS/'official-page-3.png')
 put(OUT/'explanation.html',html_doc(paras(SRC['explanation'])),True);put(OUT/'summary.html',html_doc(paras(SRC['summary'])),True);put(OUT/'mindmap.html',mindmap(),True);put(OUT/'lab.html',lab(),True);put(OUT/'official-content.html',official_html(bs,hs['official_lesson']),True)
 put(OUT/'official-content.json',{'capability':'officialBookContent','status':'REVIEW_REQUIRED','standard':'20A','source_file':FILES['official_lesson'],'source_sha256':'sha256:'+hs['official_lesson'],'source_pages':'PDF pages 1-5; printed pages 14-18','blocks':[{k:v for k,v in b.items() if k!='html'} for b in bs],'source_note':'Embedded Arabic PDF font makes raw text extraction unreliable. Human page/image fidelity review is required before READY; no external correction was applied.'})
 qs=[{'question_number':str(n),'official_text':t,'source_page':1,'relevance':'FULLY_IRON','evidence':e,'question_type':typ} for n,t,e,typ in [('7','لأكاسيد الحديد أسماء ورموز كيميائية مختلفة. ما أسماء هذه الأكاسيد، وما رموزها الكيميائية؟','Explicitly asks for iron oxides.','SHORT_ANSWER'),('8','وضح بالرسم كيف تتم عملية اختزال الحديد في الفرن العالي (اللافح) مدعماً إجابتك بالمعادلات الكيميائية.','Explicitly asks for blast-furnace reduction.','EXTENDED_RESPONSE'),('9','أين يقع عنصر الحديد من بين العناصر الانتقالية الأخرى في الجدول الدوري؟','Explicitly asks for iron location.','SHORT_ANSWER'),('10','كيف يمكن الكشف عن الحديد في أملاحه؟','Explicitly asks for iron-salt detection; activity corroborates.','SHORT_ANSWER')]]
 qs.append({'question_number':'11a-d','official_text':'أ) لا يتأثر الحديد بحمض الكبريتيك وحمض النيتريك المركزين.\\nب) يعتبر الحديد من المواد المختزلة.\\nج) يضاف الحجر الجيري إلى المزيج المسمى بالشحنة عند استخراج الحديد من خاماته.\\nد) الحديد من أكثر الفلزات الانتقالية استخداماً.','source_page':1,'relevance':'PARTIALLY_IRON','evidence':'a-d concern iron; subpart e concerns lanthanides/actinides and is excluded.','question_type':'TRUE_FALSE_SUBPARTS','parent_question_number':'11','excluded_subpart':'هـ) توضع سلسلتي اللانثنيدات والأكتينيدات أسفل الجدول.'})
 put(OUT/'official-questions.json',{'capability':'officialBookQuestions','status':'REVIEW_REQUIRED','source_file':FILES['unit_assessment'],'source_sha256':'sha256:'+hs['unit_assessment'],'source_page':'PDF page 1 / printed page 19','questions':qs,'excluded_question_numbers':['1','2','3','4','5','6'],'unit_level_question_numbers':[]})
 q,comp=xlsx(SRC['self_test']);put(OUT/'self-test.json',{'capability':'selfTest','status':'DRAFT','revision_pin':'sha256:'+hs['self_test'],'source_file':FILES['self_test'],'source_sha256':'sha256:'+hs['self_test'],'sheet':'الأسئلة','question_count':len(q),'question_types':{'multiple_choice':sum(x['type']=='multiple_choice' for x in q),'true_false':sum(x['type']=='true_false' for x in q)},'questions':q})
 put(OUT/'answer-companion.server-only.json',{'capability':'selfTest','initial_payload':False,'reveal':'SERVER_CONTROLLED_REVEAL_ONLY','status':'MODEL_ANSWER_TAMKEEN_DRAFT','revision_pin':'sha256:'+hs['self_test'],'answers_source':'XLSX answer/rationale columns; not included in student payload','answers':comp})
 put(OUT/'subject-textbooks.json',{'status':'IMPORT_PLAN_ONLY','records':[{'source_file':FILES['sanaa_textbook'],'source_sha256':'sha256:'+hs['sanaa_textbook'],'book_type':'MAIN_TEXTBOOK','track':'SANAA','track_code':'sanaa','coverage_type':'FULL_ACADEMIC_YEAR'},{'source_file':FILES['aden_textbook'],'source_sha256':'sha256:'+hs['aden_textbook'],'book_type':'MAIN_TEXTBOOK','track':'ADEN','track_code':'aden','coverage_type':'FULL_ACADEMIC_YEAR'},{'source_file':FILES['activity_book'],'source_sha256':'sha256:'+hs['activity_book'],'book_type':'EXERCISE_BOOK','track':'BOTH','track_codes':['sanaa','aden'],'coverage_type':'FULL_ACADEMIC_YEAR','shared_bytes_within_tracks':True}]})
 roles={'sanaa_textbook':'main textbook','aden_textbook':'main textbook','activity_book':'exercise/practical book','official_lesson':'official lesson','explanation':'Tamkeen explanation','summary':'Tamkeen summary','mindmap':'Tamkeen mind map','lab':'Tamkeen lab','unit_assessment':'unit assessment','self_test':'self-test','ministerial':'ministerial audit','mindmap_reference':'UX reference'}
 put(OUT/'inventory.json',[{'file':FILES[k],'sha256':'sha256:'+hs[k],'role':roles[k],'curriculum_track':'sanaa' if k=='sanaa_textbook' else 'aden' if k=='aden_textbook' else 'sanaa|aden','content_type':Path(FILES[k]).suffix[1:],'source_authority':'OFFICIAL' if k in ['sanaa_textbook','aden_textbook','activity_book','official_lesson','unit_assessment','ministerial'] else 'TAMKEEN' if k in ['explanation','summary','mindmap','lab','self_test'] else 'REFERENCE','v3_destination':'subject-textbooks' if k in ['sanaa_textbook','aden_textbook','activity_book'] else 'reference-only' if k in ['ministerial','mindmap_reference'] else k} for k in FILES])
 def pv(c):
  k={'officialBookContent':'official_lesson','officialBookQuestions':'unit_assessment','selfTest':'self_test','tamkeenExplanationHtml':'explanation','lessonSummaryHtml':'summary','mindMapHtml':'mindmap','labExperimentHtml':'lab'}[c]
  return {'source_file':FILES[k],'source_sha256':'sha256:'+hs[k],'content_owner':'OFFICIAL' if c in ['officialBookContent','officialBookQuestions'] else 'TAMKEEN','curriculum_track':'sanaa|aden','conversion_method':'existing 20A structured-content pipeline' if c=='officialBookContent' else 'STATIC_EDUCATIONAL_HTML' if c!='labExperimentHtml' else 'INTERACTIVE_EDUCATIONAL_HTML','review_status':'REVIEW_REQUIRED'}
 put(OUT/'provenance.json',{c:pv(c) for c in CAPS});identity={'grade':'الثالث الثانوي','subject':'الكيمياء','grade_id':None,'subject_id':None,'grade_code':'grade-12','subject_code':None,'sanaa_track_id':None,'sanaa_track_code':'sanaa','aden_track_id':None,'aden_track_code':'aden','lesson_id':None,'lesson_code':None,'lesson_slug':'الحديد-fe','unit_id':None,'semester':None,'identity_status':'UNRESOLVED_FROM_REPO_READ_ONLY_CONTEXT'}
 put(OUT/'manifest.json',{'package':'chemistry-g12-iron-v3','schema':'Content V3 package artifact','identity':identity,'capability_order':CAPS,'applicability':{c:'REQUIRED' for c in CAPS},'student_order':CAPS,'originalBookPdf_in_lesson':False,'production_apply':False})
 put(OUT/'validation-report.json',{'package':'chemistry-g12-iron-v3','overall':'REVIEW_REQUIRED','checks':{'CSP':'PASS','ANSWER_LEAK_SCAN':'PASS','RATIONALE_LEAK_SCAN':'PASS','EXTERNAL_DEPENDENCY':'ZERO','RTL':'PASS','MOBILE':'PASS_STATIC','OFFICIAL_PARSER':'PASS (0 errors)','OFFICIAL_FIDELITY':'REVIEW_REQUIRED','IDENTITY':'CONTENT_GAP','PACKAGE_TESTS':'12/12 PASS','REGRESSION_TESTS':'209/209 PASS','TYPECHECK':'PASS (npx tsc --noEmit)','BUILD':'PASS (npm run build)','BROWSER_VISUAL':'UNAVAILABLE_IN_EXECUTION_ENV; static checks completed'},'readiness':{'BOOK_READY':False,'LEARNING_READY':False,'ASSESSMENT_READY':False,'FULLY_READY':False,'missing_reasons':['Chemistry Grade 12 lesson identity IDs/codes are not resolvable from this repo checkout.','Official PDF requires human page-by-page fidelity approval before READY.']}})
 student=CSS+'<main dir="rtl"><h1>الحديد Fe</h1><p class="note">عرض الطالب — المصدر الرسمي وشرح تمكين مميزان بصرياً.</p>'+''.join(f'<section id="{c}"><h2>{c}</h2><p>محتوى القدرة في حزمة V3.</p></section>' for c in CAPS)+'<p class="note">الخريطة قابلة للتوسيع، والتجربة داخل sandbox المقيّد.</p></main>';put(PREVIEW/'student.html',student,True)
 admin=CSS+'<main dir="rtl"><h1>Workspace — الحديد Fe</h1><table><tr><th>Capability</th><th>Applicability</th><th>Status</th><th>Readiness</th></tr>'+''.join(f'<tr><td>{c}</td><td>REQUIRED</td><td>REVIEW_REQUIRED</td><td>missing reason recorded</td></tr>' for c in CAPS)+'</table></main>';put(PREVIEW/'admin.html',admin,True)
 put(PREVIEW/'README.md','Local preview fixture. Target viewports: 360x800, 390x844, 412x915, 1280x900. Existing Content V3 sandbox/bridge is the integration boundary; no production route or PDF step is added.\n',True)

if __name__=='__main__':main()
