# Sak Ngam Academic — กฎถาวรสำหรับงานพัฒนา (Claude Code)

รายงานและสื่อสารกับผู้ใช้เป็นภาษาไทย กระชับ ระบุเฉพาะ: สิ่งที่เสร็จ ปัญหา และสิ่งที่ต้องให้ผู้ใช้ตัดสินใจ

## กฎการ Deploy (บังคับ)
1. พัฒนา แก้ไข และ Push โค้ดทุกครั้งผ่าน **Vercel Preview เท่านั้น**
2. **ห้าม Deploy Production** และห้ามใช้ `vercel --prod` (หรือคำสั่ง/ตัวเลือกที่ promote ไป Production)
3. **ห้าม Merge เข้า `main` หรือ Production Branch** และห้าม Push ไป Branch เหล่านั้น เว้นแต่ผู้ใช้อนุญาตเป็นลายลักษณ์อักษรเฉพาะครั้ง
4. ใช้ Development/Feature Branch เท่านั้น (Branch ปัจจุบันของเซสชัน เช่น `claude/*`) ไม่ Force-push ไม่เขียนประวัติของ Branch ที่ไม่ใช่ของตน
5. ตรวจว่า Vercel เชื่อม Branch สำหรับ Preview ถูกต้อง: ที่ Vercel → Project → Settings → Git — *Production Branch* ต้อง **ไม่ใช่** Branch พัฒนา, และเปิด Preview Deployments สำหรับ Branch อื่น ๆ ถ้าตรวจจากเซสชันไม่ได้ ให้แจ้งผู้ใช้เป็นข้อ ๆ ให้ตรวจเอง
6. หลัง Push ให้ตรวจสถานะ Preview Deployment และส่ง **URL สำหรับทดสอบ** ให้ผู้ใช้ (ถ้าเข้าถึง Vercel/GitHub จากเซสชันไม่ได้ ให้บอกชัดเจนว่ายังตรวจไม่ได้ และบอกว่าดู URL ได้ที่ใด — ห้ามเดา URL)
7. ถ้า Preview Deploy ล้มเหลว: รายงานสาเหตุ (log/ข้อความผิดพลาด) **ห้ามสลับไป Deploy Production**
8. **ห้ามเปลี่ยน Production Environment Variables** (และห้ามใส่ Secret ใน Frontend/Repo)
9. การแก้ไข **Supabase Hosted Staging** (ฐานข้อมูล, Auth, Storage, Migration) ต้องขออนุมัติแยกต่างหากทุกครั้ง — ผู้ใช้เป็นผู้รัน SQL/Migration เอง หรืออนุมัติเป็นรายครั้ง

## ข้อกำหนดถาวรอื่น ๆ
- ห้ามแตะ Production ทุกชนิด ห้าม Reset ฐานข้อมูล (Hosted หรือ Local ที่มีข้อมูลสำคัญ) ห้ามลบข้อมูลเดิมโดยไม่ได้รับอนุมัติ ห้ามใช้ CASCADE DELETE เพื่อลบข้อมูลหลักสูตร
- AI **ไม่อนุมัติ/ข้าม/ตัดสิน** ข้อมูลหลักสูตร ข้อขัดแย้ง หรือชุดนำเข้าแทนฝ่ายวิชาการ รักษา Two-person Approval (ผู้อนุมัติ ≠ ผู้สร้าง และต้องเป็นหัวหน้าฝ่ายวิชาการ)
- ห้ามเดามาตรฐาน ตัวชี้วัด เกณฑ์เวลาเรียน ชื่อแผนการเรียน หรือรหัส — ใช้ข้อมูลจากเอกสารต้นฉบับ/ฐานข้อมูลพร้อมอ้างหน้า PDF
- ห้าม Commit: Secret/Key, PDF/ZIP/Excel ต้นฉบับ, ข้อมูลหลักสูตรที่ยังไม่อนุมัติ, ข้อมูลส่วนบุคคลจริง
- ห้ามเปิด Self-signup ห้ามเผยแพร่ Service-role Key ห้ามผ่อนปรน RLS เพื่อเลี่ยงปัญหา
- Migration เป็น forward-only; แจกไฟล์ให้ผู้ใช้รันใน SQL Editor แล้วบันทึกประวัติ (`supabase_migrations.schema_migrations`) — ห้ามบันทึกประวัติก่อนรันจริง
- ทดสอบเฉพาะส่วนที่แก้ (pgTAP / typecheck / build) ก่อน Commit; ไม่รัน E2E ที่ Reset ฐานข้อมูล
- ประหยัด Token: ใช้โค้ด/Schema เดิม ไม่สร้างระบบซ้ำ
