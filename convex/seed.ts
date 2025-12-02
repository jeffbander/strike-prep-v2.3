import { mutation } from "./_generated/server";
import { v } from "convex/values";

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

// Sample first and last names for generating fake providers
const FIRST_NAMES = [
  "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
  "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
  "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
  "Matthew", "Margaret", "Anthony", "Betty", "Mark", "Sandra", "Donald", "Ashley",
  "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
  "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
];

/**
 * Seed a test service with 5 workers per shift, and create matching providers
 * This is for departmental admin testing
 */
export const seedTestServiceWithProviders = mutation({
  args: {
    departmentId: v.id("departments"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const department = await ctx.db.get(args.departmentId);
    if (!department) throw new Error("Department not found");

    const hospital = await ctx.db.get(department.hospitalId);
    if (!hospital) throw new Error("Hospital not found");

    // Get a job type (or create one if none exist)
    let jobType = await ctx.db
      .query("job_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", department.healthSystemId))
      .first();

    if (!jobType) {
      // Create a default job type
      const jobTypeId = await ctx.db.insert("job_types", {
        healthSystemId: department.healthSystemId,
        name: "Physician Assistant",
        code: "PA",
        isActive: true,
        isDefault: false,
      });
      jobType = await ctx.db.get(jobTypeId);
    }

    if (!jobType) throw new Error("Could not find or create job type");

    // Get some skills
    const skills = await ctx.db.query("skills").take(3);
    const skillIds = skills.map((s) => s._id);

    // Create the service with 5 workers per shift
    const HEADCOUNT = 5;
    const serviceShortCode = "TEST";

    const serviceId = await ctx.db.insert("services", {
      departmentId: args.departmentId,
      hospitalId: department.hospitalId,
      healthSystemId: department.healthSystemId,
      name: "Test Strike Service",
      shortCode: serviceShortCode,
      dayShiftStart: "07:00",
      dayShiftEnd: "19:00",
      nightShiftStart: "19:00",
      nightShiftEnd: "07:00",
      operatesDays: true,
      operatesNights: true,
      operatesWeekends: true,
      createdBy: currentUser._id,
      isActive: true,
      createdAt: Date.now(),
    });

    // Create service_job_type with headcount of 5
    const serviceJobTypeId = await ctx.db.insert("service_job_types", {
      serviceId,
      jobTypeId: jobType._id,
      headcount: HEADCOUNT,
      operatesDays: true,
      operatesNights: true,
    });

    // Add skills to service job type
    for (const skillId of skillIds) {
      await ctx.db.insert("service_job_type_skills", {
        serviceJobTypeId,
        skillId,
        isRequired: true,
      });
    }

    // Create shifts: Weekday_AM, Weekday_PM, Weekend_AM, Weekend_PM
    const shiftsToCreate = [
      { shiftType: "Weekday_AM", name: "Weekday Day Shift", start: "07:00", end: "19:00" },
      { shiftType: "Weekday_PM", name: "Weekday Night Shift", start: "19:00", end: "07:00" },
      { shiftType: "Weekend_AM", name: "Weekend Day Shift", start: "07:00", end: "19:00" },
      { shiftType: "Weekend_PM", name: "Weekend Night Shift", start: "19:00", end: "07:00" },
    ];

    let totalPositions = 0;
    const shiftIds: string[] = [];

    for (const shiftInfo of shiftsToCreate) {
      const shiftId = await ctx.db.insert("shifts", {
        serviceId,
        serviceJobTypeId,
        name: shiftInfo.name,
        shiftType: shiftInfo.shiftType,
        startTime: shiftInfo.start,
        endTime: shiftInfo.end,
        positionsNeeded: HEADCOUNT,
        isActive: true,
      });

      shiftIds.push(shiftId.toString());

      // Create job positions (5 per shift)
      for (let i = 1; i <= HEADCOUNT; i++) {
        const deptCode = department.name.replace(/[^a-zA-Z]/g, "").substring(0, 8);
        const shiftCodeMap: Record<string, string> = {
          "Weekday_AM": "WD_AM",
          "Weekday_PM": "WD_PM",
          "Weekend_AM": "WE_AM",
          "Weekend_PM": "WE_PM",
        };
        const shiftCode = shiftCodeMap[shiftInfo.shiftType];
        const jobCode = `${deptCode}${hospital.shortCode}${serviceShortCode}${jobType.code}${shiftCode}_${i}`;

        await ctx.db.insert("job_positions", {
          shiftId,
          serviceJobTypeId,
          serviceId,
          hospitalId: department.hospitalId,
          departmentId: args.departmentId,
          jobCode,
          positionNumber: i,
          status: "Open",
          isActive: true,
        });

        totalPositions++;
      }
    }

    // Now create providers to match each position (5 providers * 4 shifts = 20 providers)
    const providersCreated: string[] = [];
    let nameIndex = 0;

    for (let i = 0; i < totalPositions; i++) {
      const firstName = FIRST_NAMES[nameIndex % FIRST_NAMES.length];
      const lastName = LAST_NAMES[Math.floor(nameIndex / FIRST_NAMES.length) % LAST_NAMES.length];
      nameIndex++;

      const employeeId = `EMP${String(1000 + i).padStart(5, "0")}`;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
      const phone = `555-${String(1000 + i).padStart(4, "0")}`;

      const providerId = await ctx.db.insert("providers", {
        healthSystemId: department.healthSystemId,
        hospitalId: department.hospitalId,
        departmentId: args.departmentId,
        jobTypeId: jobType._id,
        firstName,
        lastName,
        employeeId,
        email,
        cellPhone: phone,
        createdBy: currentUser._id,
        isActive: true,
        createdAt: Date.now(),
      });

      // Add home hospital to access list
      await ctx.db.insert("provider_hospital_access", {
        providerId,
        hospitalId: department.hospitalId,
      });

      // Add skills to provider
      for (const skillId of skillIds) {
        await ctx.db.insert("provider_skills", {
          providerId,
          skillId,
        });
      }

      providersCreated.push(providerId.toString());
    }

    return {
      success: true,
      serviceId,
      serviceName: "Test Strike Service",
      headcount: HEADCOUNT,
      shiftsCreated: shiftsToCreate.length,
      totalPositions,
      providersCreated: providersCreated.length,
      message: `Created service with ${HEADCOUNT} workers per shift (${shiftsToCreate.length} shifts = ${totalPositions} positions), and ${providersCreated.length} matching providers`,
    };
  },
});
