# Paperclip AI Office — Design Goal
Version: 1.0
Prepared: 13 September 2026
Deliverable: Design brief and project handoff for Codex. This document defines the proposed product; it does not report a completed installation.

## 1. เป้าหมายของโปรเจกต์

ต่อยอด Paperclip ให้เป็นศูนย์คุมงาน Agent สำหรับเจ้าของคนเดียวที่มีหลายโปรเจกต์ เช่น Prompt Library, Viral Content Factory และ Give2u โดยเพิ่มหน้า AI Office ที่ใช้ภาพสำนักงานที่สร้างด้วย AI เป็นฉากหลัง และซ้อนกล่อง HTML ที่แสดงข้อมูลจริงจาก Paperclip

ผู้ใช้ต้องตอบได้จากหน้าจอเดียวว่า:
- Agent แต่ละตัวกำลังทำงานอะไร และทำให้โปรเจกต์ไหน
- งานไหนกำลังรัน อยู่ในคิว ติดปัญหา หรือรอผู้ใช้ตัดสินใจ
- การทำงานล่าสุดเกิดขึ้นเมื่อไร และมีข้อความหรือไฟล์ผลลัพธ์อะไร
- จะเปิดรายละเอียด มอบหมายงาน ส่งข้อความ หรือใช้คำสั่งจัดการที่ Paperclip รองรับได้อย่างไร

แนวภาพ: Dark mode, สำนักงานอบอุ่นร่วมสมัย, ตัวละคร Anime/Chibi แบบในภาพอ้างอิง, แสงหน้าจอสีฟ้าและแสงห้องโทนอุ่น ตัวหนังสือและปุ่มเป็น UI ที่อ่านได้ชัดเจน

ชื่อที่เสนอ: Paperclip AI Office
ชื่อโฟลเดอร์ที่เสนอเมื่อเริ่มใหม่: paperclip-office
Upstream: https://github.com/paperclipai/paperclip

## 2. การตัดสินใจด้านภาพ

แนวทางที่เลือกสำหรับ MVP คือ “ภาพสำนักงานหนึ่งภาพ + กล่อง Agent ที่จัดตำแหน่งได้ + แผงรายละเอียดที่เชื่อมข้อมูลจริง”

| ตัวเลือก | สิ่งที่ต้องทำ | เหมาะกับระยะ |
| --- | --- | --- |
| ภาพฉากรวมโต๊ะและตัวละคร + HTML overlay | สร้างภาพหนึ่งครั้ง แล้วจัดกล่องให้ตรงแต่ละโต๊ะ | MVP ที่เลือก |
| ภาพห้องเปล่า + ภาพตัวละครโปร่งใส + HTML overlay | จัดและเปลี่ยนตัวละครรายตัวได้ ต้องมี asset และตำแหน่งแยก | เพิ่มภายหลังเมื่ออยากเปลี่ยนตัวละครบ่อย |
| สำนักงาน 3D | ต้องดูแลฉาก โมเดล กล้อง และ renderer | อยู่นอกเป้าหมายรุ่นแรก |

ภาพตัวละครใน MVP เป็นภาพประกอบของตำแหน่งที่นั่ง สถานะการทำงานต้องอ่านจากกล่องข้อมูล ภาพนั่งหน้าคอมพิวเตอร์ไม่ได้เป็นหลักฐานว่า Agent กำลังรัน

### ชั้นแสดงผล

| ชั้น | เนื้อหา | เมื่อสถานะเปลี่ยน |
| --- | --- | --- |
| Background | ห้อง โต๊ะ ตัวละคร แสง และของตกแต่ง | ใช้ภาพเดิม |
| Agent card | ชื่อ บทบาท โปรเจกต์ สถานะการรัน และงานที่ผูกอยู่ | อัปเดตจากข้อมูล Paperclip |
| Status effect | จุดสถานะ ขอบเรืองแสง และข้อความเตือน | เปลี่ยนตามสถานะที่ยืนยันได้ |
| Inspector | งาน ข้อความ กิจกรรม ไฟล์ และคำสั่งจัดการ | โหลดตาม Agent/งานที่เลือก |

ชื่อ Agent, task ID, ตัวเลขงบ, สถานะ, โลโก้บริษัท และปุ่มต้องเป็น UI ที่แก้ไขได้ วางพื้นที่สำหรับข้อมูลเหล่านี้ไว้ในภาพโดยไม่พิมพ์ข้อความลงในภาพ

## 3. โครงสร้างระบบที่เลือก

เพิ่มหน้า Office เป็น feature module ในแอป Paperclip ที่ clone หรือ fork มา โดยใช้ React UI, Node server, PostgreSQL, company context, API clients, authorization และ live event infrastructure เดิม

เหตุผล: ทีมสามารถใช้ข้อมูลและคำสั่งจัดการที่หน้า Agent/Issue เดิมใช้อยู่ และจำกัดการแก้ upstream ให้อยู่ในส่วนที่เกี่ยวกับ Office

ทางเลือก plugin ของ Paperclip มี page/sidebar/stream surface แล้ว แต่เอกสารยังระบุว่าเป็น alpha จึงกำหนด MVP เป็น feature module ในแอปเดิม การย้ายเป็น plugin ประเมินแยกเมื่อ interface ที่ต้องใช้รองรับครบและผ่านการทดสอบ

เส้นทางข้อมูล:
1. ผู้ใช้เปิด Office ภายใต้ company ที่เลือก
2. UI โหลด Agents, Issues, Runs และ scene settings จากบริการเดิม/บริการฉากใหม่
3. ใช้ LiveUpdatesProvider เดิมรับ event ของ company แล้วปรับ query cache หรือโหลดข้อมูลที่เกี่ยวข้องใหม่
4. UI แปลงข้อมูลเป็นกล่องบนภาพและรายการงาน
5. คำสั่งผู้ใช้ส่งผ่าน API และ permission checks ของ Paperclip
6. Codex ทำงานผ่าน adapter ของ Paperclip แล้วส่งผลและสถานะกลับเข้าระบบเดิม

หน้าเว็บเก็บเฉพาะข้อมูลที่แสดงได้ ห้ามนำ credential ของ Codex หรือ provider มาวางใน scene config, URL, localStorage หรือ frontend bundle

### ใช้ของเดิมและเพิ่มอะไร

| ความสามารถ | แหล่งที่มา |
| --- | --- |
| Company, Projects, Goals, Agents, Issues | ใช้ Paperclip |
| Codex execution และจัดการ session | ใช้ adapter ของ Paperclip |
| งานตามรอบ งบ การอนุมัติ และประวัติ | ใช้บริการที่ Paperclip มีจริงใน version ที่เลือก |
| Office scene และที่นั่ง | เพิ่ม |
| Agent cards ที่ผูกกับข้อมูลจริง | เพิ่ม |
| Scene editor และการบันทึกตำแหน่ง | เพิ่ม |
| Inspector แบบย่อบนหน้า Office | ใช้ API/องค์ประกอบเดิม แล้วเพิ่ม UI ประกอบ |
| Higgsfield, นำเข้าพรอมต์, โพสต์หลายแพลตฟอร์ม | งาน integration แยกในระยะถัดไป |

Paperclip ทำหน้าที่ประสานงาน ส่วนความสามารถเฉพาะงานขึ้นกับ tools, skills และสิทธิ์ที่ Agent ได้รับ การเพิ่มชื่อโปรเจกต์อย่างเดียวไม่ได้ทำให้บริการภายนอกเชื่อมต่อเสร็จ

## 4. ขอบเขต MVP

### 4.1 Office Dashboard

- Header: ชื่อองค์กร, ตัวเลือกโปรเจกต์, สถานะการเชื่อมต่อ, เวลาข้อมูลล่าสุด และ New Task
- Navigation: เพิ่ม Office และใช้ทางเข้าหน้า Projects, Tasks, Agents, Approvals และ Settings เดิม
- Scene: ภาพสำนักงานพร้อมที่นั่งเริ่มต้น 6 ตำแหน่ง จำนวนที่นั่งไม่ใช่ข้อจำกัดจำนวน Agent ที่ backend รันได้
- Agent card: ชื่อ, บทบาท, provider, สถานะการรัน, งาน/โปรเจกต์ที่เกี่ยวข้อง, เวลาล่าสุด และเมนูจัดการ
- Inspector ด้านขวา: เปิดเมื่อเลือก Agent หรือ Task
- Active Tasks ด้านล่าง: งาน, ผู้รับผิดชอบ, project, workflow status และเวลาที่อัปเดต
- Agent ที่ไม่มีที่นั่งแสดงในรายการ “Unseated agents” กดเข้ารายละเอียดได้ ไม่ซ่อนไว้จนผู้ใช้หาไม่เจอ
- ถ้า Agent มีหลาย run พร้อมกัน แสดงจำนวน run และให้เลือกใน Inspector

บริษัทตัวอย่างมี 3 Agent: Planner, Executor และ Reviewer สามารถใช้ Codex เป็น runtime ของหลายบทบาทได้ แต่แต่ละบทบาทต้องมี instructions และ workspace/context ที่ชัดเจน ทั้งสามเป็น configuration ที่เสนอ ยังไม่ถือว่าได้สร้างจริง

### 4.2 ขอบเขตของตัวกรอง

MVP มีสำนักงานหลักหนึ่งฉากต่อ company
- ฉากแสดงทีมของ company พร้อมชื่อโปรเจกต์ที่กำลังทำจริงบนการ์ด
- Project filter ใช้กรองรายการงาน ตัวเลขสรุปของงาน และเนื้อหาใน task inspector
- ถ้า Agent กำลังทำงานให้โปรเจกต์อื่น ให้คงชื่อโปรเจกต์นั้นบนการ์ดและลดความเด่น ห้ามแสดงว่างานนั้นเป็นของโปรเจกต์ที่กรองอยู่
- ตัวเลข “Agent กำลังรัน” ระบุว่าเป็นระดับ company; ตัวเลขงานระบุขอบเขตโปรเจกต์ให้ชัด
- การเลือก task เป็นตัวกำหนด discussion thread; ไม่รวมข้อความคนละงานเข้าด้วยกันโดยไม่มีป้ายกำกับ

### 4.3 Agent / Task Inspector

Tabs ที่เสนอ:
- Overview: lifecycle, active runs, current task, project, provider และเวลาล่าสุด
- Discussion: ข้อความและความคิดเห็นจริงในงาน พร้อมผู้เขียนและเวลา
- Activity: เหตุการณ์การรันและ tool activity ที่ระบบเปิดเผยให้ผู้ใช้ได้
- Files: ไฟล์หรือ work products ของงาน พร้อมลิงก์เปิด/ดาวน์โหลดที่ตรวจสิทธิ์แล้ว

ข้อความอย่าง “กำลังออกแบบ” หรือ “กำลังตรวจงาน” ใช้ได้เมื่อมี task role, workflow หรือ activity event รองรับ มิฉะนั้นใช้คำทั่วไปว่า “กำลังทำงาน” ห้ามสร้างบทสนทนาแทน Agent หรืออ้างว่าแสดงความคิดภายในทั้งหมด

ถ้าต้องการสรุป discussion ด้วย AI ในอนาคต ต้องติดป้ายว่าเป็นบทสรุป พร้อมระบุงานและช่วงเวลาที่สรุป

### 4.4 คำสั่งจัดการ

| คำสั่ง | พฤติกรรม |
| --- | --- |
| View Agent / View Task | เปิด Inspector หรือหน้ารายละเอียดเดิม |
| New Task / Assign | ใช้ flow และ permission เดิมของ Paperclip |
| Send Message | ส่งเป็นข้อความในงานที่เลือก และแสดงให้ชัดว่าอาจปลุก Agent ตามกติกาของระบบ |
| Run Now | ใช้ invoke/wakeup ของ Paperclip เมื่อผู้ใช้มีสิทธิ์และ state รองรับ |
| Pause / Resume Agent | ใช้คำสั่ง lifecycle เดิม พร้อมอธิบายผลที่ endpoint เวอร์ชันนั้นรองรับ |
| Cancel / Interrupt Run | แสดงเมื่อ runtime และ run รองรับ ใช้ control ของ run โดยตรง |
| Approve / Reject | ผูกกับ approval record จริงและสิทธิ์เดิม |

ห้ามตีความ Pause Agent ว่าเท่ากับหยุด process ปัจจุบันเสมอ ให้ตรวจ semantics ของ endpoint และใช้ข้อความบนปุ่มให้ตรงผลจริง การกู้คืนหรือ retry ต้องผ่าน flow เดิมที่ตรวจ replay และผลข้างเคียง; ถ้า Office ยังทำไม่ได้ให้พาไปหน้ารายละเอียดเดิม

ทุกปุ่มต้องมี pending/success/error state, ป้องกันการกดซ้ำระหว่างส่ง, ตรวจสิทธิ์ที่ server และยืนยันผลจาก backend ก่อนรายงานสำเร็จ

### 4.5 Scene Editor

- Upload หรือเลือกภาพสำนักงานที่ผู้ใช้เตรียมไว้
- ดูขนาดภาพจริงและ aspect ratio
- เพิ่ม/เลื่อน/ย่อขยายกล่องที่นั่ง
- เลือก Agent ที่ผูกกับที่นั่ง
- Preview, Save และ Cancel การเปลี่ยน layout
- Reload แล้วได้ตำแหน่งเดิม
- เปลี่ยนภาพต้องเข้า Preview การจัดวางก่อน Save
- ไม่อนุญาต Agent เดียวผูกซ้ำหลายที่นั่งในฉากเดียวสำหรับ MVP
- โหมดใช้งานปกติไม่ลากกล่องโดยไม่ตั้งใจ
- มีวิธีปรับตำแหน่งด้วยคีย์บอร์ด/ตัวเลขสำหรับคนที่ลากไม่สะดวก
- การบันทึกใช้ revision/version ตรวจการแก้ชนกัน

## 5. การแสดงสถานะที่เชื่อถือได้

แยก 3 เรื่อง: สถานะ Agent, สถานะการรัน และสถานะงาน ระบบต้องคงค่าดั้งเดิมไว้ใน view model เพื่อไม่ให้การแปลงข้อความทำความหมายหาย

### 5.1 Agent lifecycle

ค่าที่พบใน upstream ที่ตรวจ: active, paused, idle, running, error, pending_approval, terminated

| ค่าต้นทาง | ข้อความบน UI |
| --- | --- |
| active / idle | พร้อมรับงาน / ว่าง ตามความหมายของค่าที่ backend ใช้ |
| running | กำลังทำงาน และแสดง active run เมื่อหาได้ |
| paused | พัก Agent |
| error | Agent มีปัญหา พร้อมลิงก์รายละเอียด |
| pending_approval | รออนุมัติ Agent |
| terminated | ยุติการใช้งาน; แสดงในรายการจัดการตามค่า filter |

“รออนุมัติ Agent” ต้องแยกจาก “งานรออนุมัติ” โดยผูกกับ record ที่ถูกต้อง

### 5.2 Run status

ค่าที่พบ: queued, scheduled_retry, running, succeeded, interrupted, failed, cancelled, timed_out

| ค่าต้นทาง | ข้อความและสีที่เสนอ |
| --- | --- |
| queued | อยู่ในคิว — เทา/ฟ้า |
| scheduled_retry | รอลองใหม่ตามกำหนด — เหลือง |
| running | กำลังทำงาน — เขียว/ฟ้า |
| succeeded | การรันล่าสุดสำเร็จ — เขียว |
| interrupted | การรันถูกขัดจังหวะ — เหลือง |
| failed / timed_out | การรันผิดพลาด / เกินเวลา — แดง |
| cancelled | ยกเลิกการรัน — เทา |

Run สำเร็จไม่ได้แปลว่า issue เสร็จแล้วเสมอ จึงแสดง badge ของ run และ issue แยกกัน

### 5.3 Issue workflow

ค่าที่พบ: backlog, todo, in_progress, in_review, done, blocked, cancelled

แสดงเป็น รอจัดแผน, พร้อมทำ, กำลังดำเนินการ, รอตรวจ, เสร็จแล้ว, ติดขัด และยกเลิก พร้อมคง status code สำหรับ filter และการจัดการ

หากไม่มีจำนวนขั้นตอนที่วัดได้ ให้แสดง stage และเวลาที่ใช้ ห้ามสร้างเปอร์เซ็นต์ความคืบหน้าจากเวลาหรือแอนิเมชัน ตัวอย่าง “3/5 งานย่อยเสร็จ” ใช้ได้เมื่อมีข้อมูลจริง

### 5.4 ความสดของข้อมูลและการเชื่อมต่อ

- ใช้ snapshot จาก server ตอนเปิดหน้า แล้วรับ live events ผ่าน connection เดิม
- ใช้ lastEventAt/updatedAt ที่มีอยู่ แสดงชื่อเวลาให้ตรงความหมาย
- ห้ามสรุปว่า Agent offline เพียงเพราะไม่มี heartbeat ใหม่: Agent อาจกำลังรอรอบงานตาม schedule
- ถ้า connection หลุด แสดง “การเชื่อมต่อขาด — ข้อมูลล่าสุดเวลา…” แล้วทำให้ข้อมูลเดิมดูเป็นข้อมูลค้าง
- เมื่อเชื่อมต่อกลับ ให้โหลด snapshot ใหม่เพื่อชดเชย event ที่ตกหล่น
- คง terminal status จากข้อมูลล่าสุดที่เชื่อถือได้; event เก่าต้องไม่ทำให้งานที่เสร็จแล้วกลับเป็นกำลังรัน
- Demo data ต้องอยู่ในโหมด Demo ที่ติดป้ายชัด และไม่แทนที่ Live data เมื่อ API ล้มเหลว
- ไม่มี heartbeat loop แยกต่อ Agent เพื่อทำให้หน้าจอเคลื่อนไหว ใช้กลไกปลุก Agent เดิมของ Paperclip

เป้าหมายที่ต้องวัดใน POC: ภายใต้เครื่องและเครือข่ายที่ใช้ทดสอบ กล่องควรเปลี่ยนภายใน 5 วินาทีหลัง server ยืนยันสถานะ และแสดง disconnected ภายใน 2 วินาทีหลัง transport แจ้งว่าการเชื่อมต่อปิด ตัวเลขเหล่านี้เป็น acceptance target ไม่ใช่ผล benchmark ที่ได้วัดแล้ว

## 6. Layout และข้อมูลที่เพิ่ม

### การจัดวาง

Desktop:
- Sidebar เดิมของ Paperclip
- Header และ filter ด้านบน
- Office กับ Inspector แบบสองคอลัมน์เมื่อพื้นที่เพียงพอ
- Active Tasks ด้านล่าง
- การ์ดใช้ตัวหนังสือขนาดอ่านได้ชัด ไม่ย่อทั้งหน้าเพื่อให้ทุกอย่างพอดี

Mobile:
- ใช้รายการ Agent cards เป็นค่าเริ่มต้น
- ภาพ Office เป็นภาพรวมที่เลือกเปิดได้
- Inspector เป็น drawer/full-screen panel
- จุดกดหลักอย่างน้อย 44px และไม่ให้ผู้ใช้ต้องกดการ์ดที่เล็กตามภาพ

พิกัดที่นั่ง:
- เก็บ x, y, width, height เป็นสัดส่วน 0 ถึง 1 ของพื้นที่ภาพจริง
- Stage ใช้ aspect ratio ของภาพต้นฉบับให้ตรงกัน
- เลือกวิธี fit ที่รักษาภาพครบ หากมี letterbox ต้องคำนวณ offset ของภาพจริง
- ห้ามอ้างพิกัดกับ viewport แล้วปล่อยให้ภาพถูก crop จนการ์ดหลุดจากโต๊ะ
- ค่าเริ่มต้น 6 ที่นั่งวางสองแถวได้ แต่ต้องจัดให้ตรงภาพที่สร้างจริงใน Editor

### ข้อมูลใหม่ที่เสนอ

OfficeScene:
- id, companyId, name
- backgroundAssetId, imageWidth, imageHeight
- isActive, revision, createdAt, updatedAt

OfficeSeat:
- id, sceneId, label
- agentId (ว่างได้)
- x, y, width, height, zIndex

LiveCardViewModel:
- agentId, agentName, role, provider
- agentLifecycle, activeRuns, latestRun
- linkedIssue, actualProject
- lastEventAt, dataFreshness, availableActions

OfficeScene และ OfficeSeat เป็นข้อมูลถาวรใหม่ ส่วน LiveCardViewModel เป็นข้อมูลแสดงผลที่ประกอบจาก Paperclip ห้ามทำฐานข้อมูล execution/status ซ้ำอีกชุดที่อัปเดตขัดกันได้

ทุกการอ่าน/แก้ scene ตรวจ company ownership ที่ server และใช้ asset storage ที่มีอยู่เมื่อรองรับ ห้ามเชื่อ URL/file path ที่ client ส่งมาโดยไม่ตรวจ

งบประมาณและ usage ใช้ข้อมูลที่ adapter รายงาน หากข้อมูลไม่ครบให้แสดงว่าไม่มีข้อมูล/เป็นค่าประมาณ ค่าใช้จ่ายที่แสดงใน Paperclip ไม่ควรถูกอ้างว่าเป็นโควตา Pro คงเหลือที่แม่นยำโดยไม่มี integration รองรับ

## 7. ลำดับการพัฒนา

### M0 — ยืนยันฐาน Paperclip
- ตรวจ workspace ปัจจุบันก่อน ถ้ามี repo หรือไฟล์ที่ผู้ใช้พัฒนาอยู่ ให้รักษางานนั้นไว้
- ถ้าเริ่มใหม่จริง ให้ clone upstream ลงโฟลเดอร์ใหม่และบันทึก commit SHA
- ติดตั้งตาม README ของ commit ที่เลือก
- ยืนยันว่า Paperclip เดิมเปิดได้และสร้าง/อ่านข้อมูลหลักได้
- ตั้ง company, project ทดลองหนึ่งโปรเจกต์ และเชื่อม Codex ให้ผ่าน auth
- รันงานเล็กหนึ่งงานและตรวจ log/ผลลัพธ์จริง

### M1 — Office MVP
- เพิ่มหน้า Office และ feature module
- เพิ่ม background upload, layout storage และ Scene Editor
- เพิ่มกล่อง Agent ที่อ่านข้อมูลจริง
- เชื่อม LiveUpdatesProvider เดิม
- เพิ่ม Inspector และ task list
- เชื่อมปุ่มที่ใช้ native action ได้ครบ และพาไป native detail เมื่อควรใช้ flow เดิม
- ตรวจ responsive, empty, loading, failed และ disconnected states

### M2 — ขยายตามการใช้งานจริง
ลำดับที่เสนอ:
1. ฉากเฉพาะโปรเจกต์ และตัวละครแยกเป็นภาพโปร่งใส
2. Team/workflow presets ที่ใช้ซ้ำได้
3. รายการงานประจำสำหรับ Prompt Library และรายงาน
4. Connector สำหรับ Higgsfield และ Content Factory
5. การแจ้งเตือนตามเหตุการณ์และมุมมอง workload/usage เพิ่มเติม

MVP ไม่รวมการสร้างภาพผ่าน provider ภายในแอป, ระบบโพสต์อัตโนมัติทุกแพลตฟอร์ม, 3D engine, billing SaaS หรือระบบผู้เช่าใหม่ รายการเหล่านี้เป็นโครงการต่อยอดที่มีขอบเขตและเกณฑ์รับงานของตัวเอง

## 8. เกณฑ์รับงาน

| ID | สถานการณ์ | ผลที่ต้องได้ |
| --- | --- | --- |
| AC01 | เปิด Paperclip หลังเพิ่ม Office | หน้าหลักและ flow เดิมยังใช้งานได้ |
| AC02 | Upload ฉาก วาง 3 Agent แล้ว Save/Reload | ภาพและพิกัดกลับมาตรงเดิม |
| AC03 | รันงานจริงด้วย Codex | การ์ดแสดง run/task/project ที่ถูกต้องและอัปเดตตาม event ภายใน target ที่กำหนด |
| AC04 | Run สำเร็จแต่งานยัง in_review | การ์ดแสดงสองสถานะแยกกัน |
| AC05 | เกิด failed/timed_out | เห็นปัญหาและเปิดดูรายละเอียดจริงได้ |
| AC06 | ไม่มี heartbeat ระหว่างรอ schedule | ไม่แสดงว่า offline โดยอัตโนมัติ |
| AC07 | ตัดและต่อ connection | แสดงข้อมูลค้างชัดเจน และโหลด snapshot ใหม่เมื่อกลับมา |
| AC08 | เลือกโปรเจกต์อื่น | งานและ discussion ถูกกรอง; การ์ดไม่อ้าง project ที่ผิด |
| AC09 | กดคำสั่งซ้ำ/ไม่มีสิทธิ์/API ล้มเหลว | ไม่สร้างการทำงานซ้ำจาก double-click ไม่รายงานสำเร็จลวง และ server ตรวจสิทธิ์ |
| AC10 | เปรียบเทียบ 1920×1080, 1280×720 และมือถือกว้าง 390px | ตำแหน่ง desktop ตรงภาพ; mobile อ่านและกดได้โดยไม่มี horizontal overflow |
| AC11 | มี Agent มากกว่าที่นั่ง | Agent ที่เหลือยังเข้าถึงได้จากรายการ |
| AC12 | สลับ company/แก้ scene ID ที่ไม่มีสิทธิ์ | ข้อมูลและ actions ไม่ข้ามขอบเขต company |

วิธีตรวจ: ใช้ unit/integration tests เฉพาะ logic ที่มีความเสี่ยงจริง เช่น status mapping, company boundary และ layout persistence; ใช้ browser checks สำหรับภาพซ้อนกล่องและ task flow หนึ่งงาน ห้ามอ้างผลผ่านก่อนรันทดสอบจริง

## 9. Brief สำหรับสร้างภาพฉาก

ใช้เมื่อเริ่มผลิต asset ภาพจริง ภาพที่แนบในบทสนทนาเป็นแนวทางด้านอารมณ์และองค์ประกอบ ไม่ใช่ไฟล์ฉาก Office ที่พร้อมใช้งาน เพราะภาพนั้นรวมเมนูและแผง UI อยู่แล้ว

Prompt:
Create a polished 16:9 office background illustration for a personal AI agent operations dashboard. A warm contemporary office at night, charcoal and deep navy interior, soft amber ceiling lights, subtle blue monitor glow, plants and clean wood details. Six friendly adult anime/chibi office workers at six clearly separated desks, arranged in two rows of three. Use a consistent slightly elevated frontal camera, similar to a stylish management game. Keep generous calm low-detail space directly below each desk for interactive status cards that will be added later. Keep all six desks fully visible. A blank central wall panel may be reserved for an editable company name. Refined, welcoming, professional, cute, readable composition. Render only the office scene. No text, no labels, no status indicators, no buttons, no sidebar, no dashboard frame, no watermark.

แนวทางเตรียม asset:
- ใช้ภาพสัดส่วน 16:9 เป็นค่าเริ่มต้น
- เก็บภาพต้นฉบับไว้ และเตรียม WebP/AVIF สำหรับเว็บ
- ตั้งเป้าขนาดไฟล์สำหรับแสดงผลประมาณ 1 MB หรือต่ำกว่าถ้าคุณภาพยังดี และจำกัด upload รุ่นแรกไม่เกิน 5 MiB
- แสดง fallback background ที่อ่านการ์ดได้หากภาพโหลดไม่สำเร็จ
- จัดพิกัดกล่องตามภาพที่ได้จริง ไม่คาดหวังว่า AI จะจัดตำแหน่งได้ตรงตัวเลขทุกพิกเซล
- เอฟเฟกต์ขอบ/จุดสถานะทำด้วย CSS และรองรับ prefers-reduced-motion

## 10. คำสั่งเริ่ม Project สำหรับ Codex

ข้อความด้านล่างเป็น handoff สำหรับใช้เมื่อผู้ใช้เริ่มงาน implementation ใน Project:

คุณกำลังทำโปรเจกต์ Paperclip AI Office โดยอ้างอิงเอกสารนี้

เป้าหมาย: ต่อยอด Paperclip ให้มีหน้า AI Office ที่ใช้ภาพสำนักงานเป็นฉากและมี interactive HTML Agent cards ซ้อนทับ แสดงข้อมูลจริงและเรียกคำสั่งจัดการของ Paperclip

เริ่มจาก:
1. ตรวจ repository, AGENTS.md, working tree และไฟล์ที่ผู้ใช้มีอยู่ก่อน ห้ามทับงานเดิม
2. ถ้ายังไม่มีฐานโปรเจกต์ ให้ clone https://github.com/paperclipai/paperclip.git ลงโฟลเดอร์ใหม่ชื่อ paperclip-office เมื่อชื่อนั้นยังไม่ถูกใช้ เก็บ upstream และบันทึก commit SHA จริง
3. ถ้ามี repo อยู่แล้ว ให้ตรวจว่าเป็น Paperclip หรือโปรเจกต์อื่นก่อนเลือกวิธีผนวก ห้าม clone ทับโฟลเดอร์เดิมหรือเดา GitHub origin ของผู้ใช้
4. อ่าน README และโครงสร้าง UI/API ของ checkout ที่เลือก แล้วทำ baseline ให้รันได้
5. ใช้แผน M0 และ M1 พร้อม AC01–AC12 เป็นขอบเขตงานหลัก
6. เพิ่ม Office เป็น feature module ในโครงสร้าง React/Node/Postgres เดิม และใช้ authentication/company context เดิม
7. ใช้ API clients และ LiveUpdatesProvider เดิม ดึงชนิดข้อมูลจาก packages/shared ของ version ที่ checkout
8. ทำ scene storage, editor, agent cards, inspector และ native management actions ตามเอกสาร
9. แยก lifecycle, run status, issue workflow และ data freshness ให้ชัดเจน
10. ใช้ภาพฉากที่ผู้ใช้อนุมัติ หากยังไม่มีให้ใช้ placeholder ที่ติดป้ายเพื่อพัฒนา layout ได้ และรายงานว่ายังรอ asset ห้ามอ้างว่า placeholder คือฉากเสร็จแล้ว
11. ตั้งค่า Agent และการเชื่อม Codex ตามสิทธิ์ที่มี ใช้วิธีเข้าสู่ระบบที่รองรับ และอย่าอ่านหรือพิมพ์ credential ลง log
12. ทดสอบกับงานจริงหนึ่งงาน รวมถึง error/reconnect และ mobile layout
13. ส่งมอบ source changes, วิธีรัน, config ที่ต้องตั้งโดยไม่ใส่ secret, ผลตรวจ และรายการข้อจำกัดที่ยังเหลือ
14. งาน integration เพิ่มเติมจาก M2 ต้องถูกแยก scope ชัดเจน ไม่ทำ mock connector แล้วรายงานว่าเชื่อมบริการจริงแล้ว

ผลสำเร็จของรอบแรกคือ: ผู้ใช้เปิด Office เห็น Agent ที่ผูกไว้ รันงานจริงหนึ่งงาน เห็นสถานะเปลี่ยน เปิดผลลัพธ์ได้ และบันทึกตำแหน่งกล่องบนภาพได้

## 11. แหล่งอ้างอิงและขอบเขตการยืนยัน

ตรวจข้อมูลเมื่อ 13 September 2026 โดยอ่านเอกสารและ source ผ่าน GitHub ยังไม่ได้ติดตั้ง Paperclip หรือรันทดสอบ runtime ในงานออกแบบครั้งนี้

Default-branch commit ที่ตรวจพบ:
c9e3bb7ca40160b2ff80958ec1a8c0254638ad42
https://github.com/paperclipai/paperclip/commit/c9e3bb7ca40160b2ff80958ec1a8c0254638ad42

เอกสารถูกอ่านจาก master ในช่วงเดียวกัน เมื่อเริ่ม implementation ต้องเลือก checkout แล้วตรวจสัญญา API ของ SHA นั้นอีกครั้ง ไม่ถือว่าลิงก์ master เป็น version lock

- Overview, stack, setup และ capabilities: https://github.com/paperclipai/paperclip
- สถานะ Agent/Issue/Run และชื่อ live events: https://github.com/paperclipai/paperclip/blob/master/packages/shared/src/constants.ts
- LiveUpdatesProvider และ company-scoped WebSocket: https://github.com/paperclipai/paperclip/blob/master/ui/src/context/LiveUpdatesProvider.tsx
- API client ของ Agent และ management actions: https://github.com/paperclipai/paperclip/blob/master/ui/src/api/agents.ts
- หน้า UI ปัจจุบัน: https://github.com/paperclipai/paperclip/tree/master/ui/src/pages
- Plugin capabilities ที่มีจริงและสถานะ alpha: https://github.com/paperclipai/paperclip/blob/master/doc/plugins/PLUGIN_AUTHORING_GUIDE.md
- Run-log event contract: https://github.com/paperclipai/paperclip/blob/master/doc/run-log-events.md

ชื่อ module, ข้อมูล OfficeScene/OfficeSeat, layout, ฟีเจอร์ Office, ลำดับพัฒนา และ acceptance targets ในเอกสารนี้เป็นข้อเสนอสำหรับโปรเจกต์ของผู้ใช้ ยังไม่ใช่ฟีเจอร์ Office ที่ติดตั้งแล้วใน upstream

