import { mutation } from "./_generated/server";

const DEFAULT_SKILLS = [
  // Basic Skills
  { name: "Medicine Basics", category: "Basic" },
  { name: "Surgical Basics", category: "Basic" },
  // Procedural Skills
  { name: "A-line placement", category: "Procedural" },
  { name: "Central line placement", category: "Procedural" },
  { name: "Foley catheter placement", category: "Procedural" },
  { name: "NG tube placement", category: "Procedural" },
  { name: "Intubation", category: "Procedural" },
  { name: "Arterial blood gas (ABG)", category: "Procedural" },
  { name: "Lumbar puncture", category: "Procedural" },
  { name: "Thoracentesis", category: "Procedural" },
  { name: "Paracentesis", category: "Procedural" },
  { name: "Chest tube placement", category: "Procedural" },
  // Specialty Skills
  { name: "Cardiology Specialty", category: "Specialty" },
  { name: "Neurosurgery Specialty", category: "Specialty" },
  { name: "Orthopedic Specialty", category: "Specialty" },
  { name: "General Surgery Specialty", category: "Specialty" },
  { name: "ICU/Critical Care Specialty", category: "Specialty" },
  { name: "Emergency Medicine Specialty", category: "Specialty" },
  { name: "Pediatrics Specialty", category: "Specialty" },
  { name: "OB/GYN Specialty", category: "Specialty" },
  { name: "Urology Specialty", category: "Specialty" },
  { name: "Dermatology Specialty", category: "Specialty" },
  { name: "Psychiatry Specialty", category: "Specialty" },
  { name: "Radiology Specialty", category: "Specialty" },
  { name: "Anesthesiology Specialty", category: "Specialty" },
  { name: "Oncology Specialty", category: "Specialty" },
  { name: "Pulmonology Specialty", category: "Specialty" },
  { name: "Gastroenterology Specialty", category: "Specialty" },
  { name: "Nephrology Specialty", category: "Specialty" },
  { name: "Endocrinology Specialty", category: "Specialty" },
  { name: "Rheumatology Specialty", category: "Specialty" },
  { name: "Infectious Disease Specialty", category: "Specialty" },
];

export const seedSkills = mutation({
  handler: async (ctx) => {
    // Check if already seeded
    const existingSkill = await ctx.db.query("skills").first();
    if (existingSkill) {
      return { skipped: true, message: "Skills already seeded" };
    }

    let count = 0;
    for (const skill of DEFAULT_SKILLS) {
      await ctx.db.insert("skills", {
        name: skill.name,
        category: skill.category,
        isSystemDefault: true,
        isActive: true,
      });
      count++;
    }

    return { success: true, created: count };
  },
});
