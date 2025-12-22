import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

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

// ═══════════════════════════════════════════════════════════════════
// COMPREHENSIVE DEMO DATA SEED
// ═══════════════════════════════════════════════════════════════════

const DEMO_HEALTH_SYSTEM = { name: "Metro Health Partners", slug: "metro-health" };

const DEMO_HOSPITALS = [
  { name: "Metro General Hospital", shortCode: "MGH", city: "Boston", state: "MA" },
  { name: "Riverside Medical Center", shortCode: "RMC", city: "Cambridge", state: "MA" },
];

const DEMO_DEPARTMENTS = [
  { name: "Medicine", hospitalIndex: 0 },
  { name: "Surgery", hospitalIndex: 0 },
  { name: "ICU", hospitalIndex: 0 },
  { name: "Emergency", hospitalIndex: 1 },
  { name: "Cardiology", hospitalIndex: 1 },
];

const DEMO_JOB_TYPES = [
  { name: "Nurse Practitioner", code: "NP" },
  { name: "Physician Assistant", code: "PA" },
  { name: "Registered Nurse", code: "RN" },
];

export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    // Get or create system user
    let systemUser = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "super_admin"))
      .first();

    if (!systemUser) {
      const userId = await ctx.db.insert("users", {
        clerkId: "system_seed_user",
        email: "system@demo.local",
        firstName: "System",
        lastName: "Admin",
        role: "super_admin",
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      systemUser = await ctx.db.get(userId);
    }

    if (!systemUser) throw new Error("Could not create system user");

    // Check if demo data exists
    let healthSystem = await ctx.db
      .query("health_systems")
      .withIndex("by_slug", (q) => q.eq("slug", DEMO_HEALTH_SYSTEM.slug))
      .first();

    if (healthSystem) {
      return { success: true, message: "Demo data already exists", healthSystemId: healthSystem._id };
    }

    // Create Health System
    const hsId = await ctx.db.insert("health_systems", {
      name: DEMO_HEALTH_SYSTEM.name,
      slug: DEMO_HEALTH_SYSTEM.slug,
      createdBy: systemUser._id,
      isActive: true,
      createdAt: Date.now(),
    });
    healthSystem = await ctx.db.get(hsId);
    if (!healthSystem) throw new Error("Failed to create health system");

    // Create Job Types
    const jobTypeMap: Record<string, Id<"job_types">> = {};
    for (const jt of DEMO_JOB_TYPES) {
      const jtId = await ctx.db.insert("job_types", {
        healthSystemId: healthSystem._id,
        name: jt.name,
        code: jt.code,
        isDefault: jt.code === "RN",
        isActive: true,
      });
      jobTypeMap[jt.code] = jtId;
    }

    // Create Hospitals
    const hospitalIds: Id<"hospitals">[] = [];
    for (const hosp of DEMO_HOSPITALS) {
      const hId = await ctx.db.insert("hospitals", {
        healthSystemId: healthSystem._id,
        name: hosp.name,
        shortCode: hosp.shortCode,
        city: hosp.city,
        state: hosp.state,
        timezone: "America/New_York",
        createdBy: systemUser._id,
        isActive: true,
        createdAt: Date.now(),
      });
      hospitalIds.push(hId);
    }

    // Create Departments - store with hospital reference
    const departmentData: Array<{ id: Id<"departments">; hospitalId: Id<"hospitals"> }> = [];
    for (const dept of DEMO_DEPARTMENTS) {
      const hospitalId = hospitalIds[dept.hospitalIndex];
      const dId = await ctx.db.insert("departments", {
        hospitalId,
        healthSystemId: healthSystem._id,
        name: dept.name,
        isDefault: dept.name === "Medicine",
        isActive: true,
      });
      departmentData.push({ id: dId, hospitalId });
    }

    // Create Services with shifts - store service data with references
    const serviceConfigs = [
      { name: "ICU Coverage", shortCode: "ICUC", deptIdx: 2, headcount: 4 },
      { name: "Medicine Floor", shortCode: "MEDF", deptIdx: 0, headcount: 3 },
      { name: "Emergency Dept", shortCode: "ED", deptIdx: 3, headcount: 5 },
    ];

    const serviceData: Array<{ id: Id<"services">; shortCode: string; hospitalId: Id<"hospitals">; departmentId: Id<"departments"> }> = [];
    for (const svc of serviceConfigs) {
      const deptInfo = departmentData[svc.deptIdx];

      const serviceId = await ctx.db.insert("services", {
        departmentId: deptInfo.id,
        hospitalId: deptInfo.hospitalId,
        healthSystemId: healthSystem._id,
        name: svc.name,
        shortCode: svc.shortCode,
        serviceType: "admit",
        dayShiftStart: "07:00",
        dayShiftEnd: "19:00",
        nightShiftStart: "19:00",
        nightShiftEnd: "07:00",
        operatesDays: true,
        operatesNights: true,
        operatesWeekends: true,
        createdBy: systemUser._id,
        isActive: true,
        createdAt: Date.now(),
      });
      serviceData.push({ id: serviceId, shortCode: svc.shortCode, hospitalId: deptInfo.hospitalId, departmentId: deptInfo.id });

      // Create service_job_types for NP
      const sjtId = await ctx.db.insert("service_job_types", {
        serviceId,
        jobTypeId: jobTypeMap["NP"],
        operatesDays: true,
        operatesNights: true,
        headcount: svc.headcount,
        weekdayAmHeadcount: svc.headcount,
        weekdayPmHeadcount: Math.ceil(svc.headcount * 0.8),
      });

      // Create shifts
      await ctx.db.insert("shifts", {
        serviceId,
        serviceJobTypeId: sjtId,
        name: `${svc.name} - Day`,
        shiftType: "Weekday_AM",
        startTime: "07:00",
        endTime: "19:00",
        positionsNeeded: svc.headcount,
        isActive: true,
      });
      await ctx.db.insert("shifts", {
        serviceId,
        serviceJobTypeId: sjtId,
        name: `${svc.name} - Night`,
        shiftType: "Weekday_PM",
        startTime: "19:00",
        endTime: "07:00",
        positionsNeeded: Math.ceil(svc.headcount * 0.8),
        isActive: true,
      });
    }

    // Create 30 Providers
    let providersCreated = 0;
    for (let i = 0; i < 30; i++) {
      const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
      const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
      const deptIdx = i % departmentData.length;
      const deptInfo = departmentData[deptIdx];

      const providerId = await ctx.db.insert("providers", {
        healthSystemId: healthSystem._id,
        hospitalId: deptInfo.hospitalId,
        departmentId: deptInfo.id,
        jobTypeId: jobTypeMap["NP"],
        firstName,
        lastName,
        employeeId: `EMP${String(10000 + i).padStart(6, "0")}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@demo.local`,
        cellPhone: `555-${String(1000 + i).padStart(4, "0")}`,
        createdBy: systemUser._id,
        isActive: true,
        createdAt: Date.now(),
      });

      await ctx.db.insert("provider_hospital_access", {
        providerId,
        hospitalId: deptInfo.hospitalId,
      });

      providersCreated++;
    }

    // Create Strike Scenario
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
    const nextFriday = new Date(nextMonday);
    nextFriday.setDate(nextMonday.getDate() + 4);
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    const scenarioId = await ctx.db.insert("strike_scenarios", {
      healthSystemId: healthSystem._id,
      hospitalId: hospitalIds[0],
      name: "Nursing Strike - Demo Week",
      description: "Demo strike scenario for testing the matching grid",
      startDate: formatDate(nextMonday),
      endDate: formatDate(nextFriday),
      affectedJobTypes: [{ jobTypeId: jobTypeMap["NP"], reductionPercent: 100 }],
      status: "Active",
      createdBy: systemUser._id,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Generate scenario positions
    let positionsCreated = 0;
    for (const svcInfo of serviceData) {
      const serviceJobTypes = await ctx.db
        .query("service_job_types")
        .withIndex("by_service", (q) => q.eq("serviceId", svcInfo.id))
        .collect();

      for (const sjt of serviceJobTypes) {
        let currentDate = new Date(nextMonday);
        while (currentDate <= nextFriday) {
          const dateStr = formatDate(currentDate);
          const headcount = sjt.weekdayAmHeadcount || sjt.headcount || 3;

          // AM positions
          for (let pos = 1; pos <= headcount; pos++) {
            await ctx.db.insert("scenario_positions", {
              scenarioId,
              serviceId: svcInfo.id,
              serviceJobTypeId: sjt._id,
              jobTypeId: sjt.jobTypeId,
              hospitalId: svcInfo.hospitalId,
              departmentId: svcInfo.departmentId,
              date: dateStr,
              shiftType: "AM",
              shiftStart: "07:00",
              shiftEnd: "19:00",
              positionNumber: pos,
              jobCode: `${svcInfo.shortCode}_NP_${dateStr}_AM_${pos}`,
              originalHeadcount: headcount,
              scenarioHeadcount: headcount,
              status: "Open",
              isActive: true,
            });
            positionsCreated++;
          }

          // PM positions
          const pmHeadcount = sjt.weekdayPmHeadcount || Math.ceil(headcount * 0.8);
          for (let pos = 1; pos <= pmHeadcount; pos++) {
            await ctx.db.insert("scenario_positions", {
              scenarioId,
              serviceId: svcInfo.id,
              serviceJobTypeId: sjt._id,
              jobTypeId: sjt.jobTypeId,
              hospitalId: svcInfo.hospitalId,
              departmentId: svcInfo.departmentId,
              date: dateStr,
              shiftType: "PM",
              shiftStart: "19:00",
              shiftEnd: "07:00",
              positionNumber: pos,
              jobCode: `${svcInfo.shortCode}_NP_${dateStr}_PM_${pos}`,
              originalHeadcount: pmHeadcount,
              scenarioHeadcount: pmHeadcount,
              status: "Open",
              isActive: true,
            });
            positionsCreated++;
          }

          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    }

    // Create provider availability
    const providers = await ctx.db
      .query("providers")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystem._id))
      .take(20);

    let availabilityCreated = 0;
    for (const provider of providers) {
      let currentDate = new Date(nextMonday);
      while (currentDate <= nextFriday) {
        if (Math.random() < 0.7) {
          await ctx.db.insert("provider_availability", {
            providerId: provider._id,
            scenarioId,
            date: formatDate(currentDate),
            availabilityType: "available",
            amAvailable: Math.random() < 0.8,
            pmAvailable: Math.random() < 0.6,
            enteredBy: systemUser._id,
            enteredAt: Date.now(),
            source: "bulk_import",
          });
          availabilityCreated++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    return {
      success: true,
      message: "Demo data created successfully!",
      healthSystemId: healthSystem._id,
      scenarioId,
      hospitalsCreated: hospitalIds.length,
      departmentsCreated: departmentData.length,
      servicesCreated: serviceData.length,
      providersCreated,
      positionsCreated,
      availabilityCreated,
    };
  },
});
