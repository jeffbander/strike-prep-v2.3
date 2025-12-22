import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════
// DEMO DATA CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const DEMO_HEALTH_SYSTEM = {
  name: "Metro Health Partners",
  slug: "metro-health",
};

const DEMO_HOSPITALS = [
  {
    name: "Metro General Hospital",
    shortCode: "MGH",
    city: "Boston",
    state: "MA",
    address: "100 Main Street",
    zipCode: "02101",
  },
  {
    name: "Riverside Medical Center",
    shortCode: "RMC",
    city: "Cambridge",
    state: "MA",
    address: "250 River Road",
    zipCode: "02139",
  },
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
  { name: "Physician", code: "MD" },
  { name: "Respiratory Therapist", code: "RT" },
];

const DEMO_SERVICES = [
  {
    name: "ICU Day Coverage",
    shortCode: "ICUD",
    departmentIndex: 2, // ICU
    serviceType: "admit",
    dayCapacity: 20,
    nightCapacity: 15,
    operatesDays: true,
    operatesNights: true,
    operatesWeekends: true,
    jobTypes: [
      { code: "NP", headcount: 4 },
      { code: "RN", headcount: 6 },
      { code: "RT", headcount: 2 },
    ],
  },
  {
    name: "Medicine Floor",
    shortCode: "MEDF",
    departmentIndex: 0, // Medicine
    serviceType: "admit",
    dayCapacity: 30,
    nightCapacity: 25,
    operatesDays: true,
    operatesNights: true,
    operatesWeekends: true,
    jobTypes: [
      { code: "NP", headcount: 3 },
      { code: "PA", headcount: 2 },
      { code: "RN", headcount: 8 },
    ],
  },
  {
    name: "Surgery Service",
    shortCode: "SURG",
    departmentIndex: 1, // Surgery
    serviceType: "procedure",
    operatesDays: true,
    operatesNights: false,
    operatesWeekends: false,
    jobTypes: [
      { code: "PA", headcount: 3 },
      { code: "RN", headcount: 4 },
    ],
  },
  {
    name: "Emergency Department",
    shortCode: "ED",
    departmentIndex: 3, // Emergency
    serviceType: "admit",
    dayCapacity: 40,
    nightCapacity: 30,
    operatesDays: true,
    operatesNights: true,
    operatesWeekends: true,
    jobTypes: [
      { code: "NP", headcount: 4 },
      { code: "PA", headcount: 4 },
      { code: "RN", headcount: 10 },
      { code: "MD", headcount: 3 },
    ],
  },
  {
    name: "Cardiac Care Unit",
    shortCode: "CCU",
    departmentIndex: 4, // Cardiology
    serviceType: "admit",
    dayCapacity: 15,
    nightCapacity: 12,
    operatesDays: true,
    operatesNights: true,
    operatesWeekends: true,
    jobTypes: [
      { code: "NP", headcount: 2 },
      { code: "RN", headcount: 4 },
    ],
  },
];

// Provider name pools
const FIRST_NAMES = [
  "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
  "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
  "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
  "Matthew", "Margaret", "Anthony", "Betty", "Mark", "Sandra", "Donald", "Ashley",
  "Steven", "Kimberly", "Paul", "Emily", "Andrew", "Donna", "Joshua", "Michelle",
  "Kevin", "Carol", "Brian", "Amanda", "George", "Dorothy", "Timothy", "Melissa",
  "Ronald", "Deborah", "Edward", "Stephanie", "Jason", "Rebecca", "Jeffrey", "Sharon",
  "Ryan", "Laura", "Jacob", "Cynthia", "Gary", "Kathleen", "Nicholas", "Amy",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
  "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
];

// ═══════════════════════════════════════════════════════════════════
// MAIN SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════

export const seedDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    // Get or create a system user for seeding
    const identity = await ctx.auth.getUserIdentity();

    let systemUser;
    if (identity) {
      systemUser = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .first();
    }

    // If no authenticated user, check for existing super admin
    if (!systemUser) {
      systemUser = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "super_admin"))
        .first();
    }

    // If still no user, create a placeholder system user
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

    if (!systemUser) {
      throw new Error("Could not create or find system user");
    }

    const results: Record<string, unknown> = {};

    // ─────────────────────────────────────────────────────────────────
    // 1. Seed Skills (if not already done)
    // ─────────────────────────────────────────────────────────────────
    const existingSkill = await ctx.db.query("skills").first();
    if (!existingSkill) {
      const skills = [
        { name: "BLS Certification", category: "Certification" },
        { name: "ACLS Certification", category: "Certification" },
        { name: "PALS Certification", category: "Certification" },
        { name: "Critical Care Experience", category: "Experience" },
        { name: "Trauma Experience", category: "Experience" },
        { name: "Cardiac Monitoring", category: "Specialty" },
        { name: "Ventilator Management", category: "Specialty" },
        { name: "Central Line Placement", category: "Procedural" },
        { name: "Intubation", category: "Procedural" },
        { name: "IV Access", category: "Basic" },
        { name: "Medication Administration", category: "Basic" },
        { name: "Patient Assessment", category: "Basic" },
      ];

      for (const skill of skills) {
        await ctx.db.insert("skills", {
          name: skill.name,
          category: skill.category,
          isSystemDefault: true,
          isActive: true,
        });
      }
      results.skillsCreated = skills.length;
    } else {
      results.skillsCreated = 0;
    }

    // ─────────────────────────────────────────────────────────────────
    // 2. Create Health System
    // ─────────────────────────────────────────────────────────────────
    let healthSystem = await ctx.db
      .query("health_systems")
      .withIndex("by_slug", (q) => q.eq("slug", DEMO_HEALTH_SYSTEM.slug))
      .first();

    if (!healthSystem) {
      const hsId = await ctx.db.insert("health_systems", {
        name: DEMO_HEALTH_SYSTEM.name,
        slug: DEMO_HEALTH_SYSTEM.slug,
        createdBy: systemUser._id,
        isActive: true,
        createdAt: Date.now(),
      });
      healthSystem = await ctx.db.get(hsId);
      results.healthSystemCreated = true;
    } else {
      results.healthSystemCreated = false;
    }

    if (!healthSystem) throw new Error("Failed to create health system");

    // ─────────────────────────────────────────────────────────────────
    // 3. Create Job Types
    // ─────────────────────────────────────────────────────────────────
    const jobTypeMap: Record<string, Id<"job_types">> = {};

    for (const jt of DEMO_JOB_TYPES) {
      let jobType = await ctx.db
        .query("job_types")
        .withIndex("by_health_system_code", (q) =>
          q.eq("healthSystemId", healthSystem._id).eq("code", jt.code)
        )
        .first();

      if (!jobType) {
        const jtId = await ctx.db.insert("job_types", {
          healthSystemId: healthSystem._id,
          name: jt.name,
          code: jt.code,
          isDefault: jt.code === "RN",
          isActive: true,
        });
        jobTypeMap[jt.code] = jtId;
      } else {
        jobTypeMap[jt.code] = jobType._id;
      }
    }
    results.jobTypesCreated = Object.keys(jobTypeMap).length;

    // ─────────────────────────────────────────────────────────────────
    // 4. Create Hospitals
    // ─────────────────────────────────────────────────────────────────
    const hospitalIds: Id<"hospitals">[] = [];

    for (const hosp of DEMO_HOSPITALS) {
      let hospital = await ctx.db
        .query("hospitals")
        .withIndex("by_short_code", (q) => q.eq("shortCode", hosp.shortCode))
        .first();

      if (!hospital) {
        const hId = await ctx.db.insert("hospitals", {
          healthSystemId: healthSystem._id,
          name: hosp.name,
          shortCode: hosp.shortCode,
          address: hosp.address,
          city: hosp.city,
          state: hosp.state,
          zipCode: hosp.zipCode,
          timezone: "America/New_York",
          createdBy: systemUser._id,
          isActive: true,
          createdAt: Date.now(),
        });
        hospitalIds.push(hId);
      } else {
        hospitalIds.push(hospital._id);
      }
    }
    results.hospitalsCreated = hospitalIds.length;

    // ─────────────────────────────────────────────────────────────────
    // 5. Create Departments
    // ─────────────────────────────────────────────────────────────────
    const departmentIds: Id<"departments">[] = [];

    for (const dept of DEMO_DEPARTMENTS) {
      const hospitalId = hospitalIds[dept.hospitalIndex];

      let department = await ctx.db
        .query("departments")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .filter((q) => q.eq(q.field("name"), dept.name))
        .first();

      if (!department) {
        const dId = await ctx.db.insert("departments", {
          hospitalId,
          healthSystemId: healthSystem._id,
          name: dept.name,
          isDefault: dept.name === "Medicine",
          isActive: true,
        });
        departmentIds.push(dId);
      } else {
        departmentIds.push(department._id);
      }
    }
    results.departmentsCreated = departmentIds.length;

    // ─────────────────────────────────────────────────────────────────
    // 6. Create Services with Job Types
    // ─────────────────────────────────────────────────────────────────
    const serviceIds: Id<"services">[] = [];
    let totalShiftsCreated = 0;

    for (const svc of DEMO_SERVICES) {
      const departmentId = departmentIds[svc.departmentIndex];
      const department = await ctx.db.get(departmentId);
      if (!department) continue;

      let service = await ctx.db
        .query("services")
        .withIndex("by_short_code", (q) => q.eq("shortCode", svc.shortCode))
        .first();

      if (!service) {
        const serviceId = await ctx.db.insert("services", {
          departmentId,
          hospitalId: department.hospitalId,
          healthSystemId: healthSystem._id,
          name: svc.name,
          shortCode: svc.shortCode,
          serviceType: svc.serviceType,
          dayCapacity: svc.dayCapacity,
          nightCapacity: svc.nightCapacity,
          dayShiftStart: "07:00",
          dayShiftEnd: "19:00",
          nightShiftStart: "19:00",
          nightShiftEnd: "07:00",
          operatesDays: svc.operatesDays,
          operatesNights: svc.operatesNights,
          operatesWeekends: svc.operatesWeekends,
          createdBy: systemUser._id,
          isActive: true,
          createdAt: Date.now(),
        });
        serviceIds.push(serviceId);

        // Create service_job_types for each job type
        for (const jt of svc.jobTypes) {
          const jobTypeId = jobTypeMap[jt.code];
          if (!jobTypeId) continue;

          const sjtId = await ctx.db.insert("service_job_types", {
            serviceId,
            jobTypeId,
            operatesDays: svc.operatesDays,
            operatesNights: svc.operatesNights,
            headcount: jt.headcount,
            weekdayAmHeadcount: jt.headcount,
            weekdayPmHeadcount: svc.operatesNights ? Math.ceil(jt.headcount * 0.8) : undefined,
            weekendAmHeadcount: svc.operatesWeekends ? Math.ceil(jt.headcount * 0.7) : undefined,
            weekendPmHeadcount: svc.operatesWeekends && svc.operatesNights ? Math.ceil(jt.headcount * 0.6) : undefined,
          });

          // Create shifts for this service_job_type
          const shiftsToCreate = [];
          if (svc.operatesDays) {
            shiftsToCreate.push({
              name: `${svc.name} - Weekday Day`,
              shiftType: "Weekday_AM",
              startTime: "07:00",
              endTime: "19:00",
              positionsNeeded: jt.headcount,
            });
          }
          if (svc.operatesNights) {
            shiftsToCreate.push({
              name: `${svc.name} - Weekday Night`,
              shiftType: "Weekday_PM",
              startTime: "19:00",
              endTime: "07:00",
              positionsNeeded: Math.ceil(jt.headcount * 0.8),
            });
          }
          if (svc.operatesWeekends && svc.operatesDays) {
            shiftsToCreate.push({
              name: `${svc.name} - Weekend Day`,
              shiftType: "Weekend_AM",
              startTime: "07:00",
              endTime: "19:00",
              positionsNeeded: Math.ceil(jt.headcount * 0.7),
            });
          }
          if (svc.operatesWeekends && svc.operatesNights) {
            shiftsToCreate.push({
              name: `${svc.name} - Weekend Night`,
              shiftType: "Weekend_PM",
              startTime: "19:00",
              endTime: "07:00",
              positionsNeeded: Math.ceil(jt.headcount * 0.6),
            });
          }

          for (const shift of shiftsToCreate) {
            await ctx.db.insert("shifts", {
              serviceId,
              serviceJobTypeId: sjtId,
              name: shift.name,
              shiftType: shift.shiftType,
              startTime: shift.startTime,
              endTime: shift.endTime,
              positionsNeeded: shift.positionsNeeded,
              isActive: true,
            });
            totalShiftsCreated++;
          }
        }
      } else {
        serviceIds.push(service._id);
      }
    }
    results.servicesCreated = serviceIds.length;
    results.shiftsCreated = totalShiftsCreated;

    // ─────────────────────────────────────────────────────────────────
    // 7. Create Providers (40 providers across departments)
    // ─────────────────────────────────────────────────────────────────
    const skills = await ctx.db.query("skills").take(6);
    const skillIds = skills.map((s) => s._id);
    let providersCreated = 0;

    // Check if providers already exist
    const existingProviders = await ctx.db
      .query("providers")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystem._id))
      .first();

    if (!existingProviders) {
      const jobTypeCodes = Object.keys(jobTypeMap);
      let nameIndex = 0;

      for (let i = 0; i < 50; i++) {
        const firstName = FIRST_NAMES[nameIndex % FIRST_NAMES.length];
        const lastName = LAST_NAMES[Math.floor(nameIndex / FIRST_NAMES.length) % LAST_NAMES.length];
        nameIndex++;

        // Distribute across departments and job types
        const deptIndex = i % departmentIds.length;
        const department = await ctx.db.get(departmentIds[deptIndex]);
        if (!department) continue;

        const jobTypeCode = jobTypeCodes[i % jobTypeCodes.length];
        const jobTypeId = jobTypeMap[jobTypeCode];

        const employeeId = `EMP${String(10000 + i).padStart(6, "0")}`;
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@metrohealth.demo`;
        const phone = `555-${String(1000 + i).padStart(4, "0")}`;

        const providerId = await ctx.db.insert("providers", {
          healthSystemId: healthSystem._id,
          hospitalId: department.hospitalId,
          departmentId: departmentIds[deptIndex],
          jobTypeId,
          firstName,
          lastName,
          employeeId,
          email,
          cellPhone: phone,
          createdBy: systemUser._id,
          isActive: true,
          createdAt: Date.now(),
        });

        // Add hospital access (home hospital + maybe one more)
        await ctx.db.insert("provider_hospital_access", {
          providerId,
          hospitalId: department.hospitalId,
        });

        // 50% chance to have access to second hospital
        if (i % 2 === 0 && hospitalIds.length > 1) {
          const otherHospital = hospitalIds.find((h) => h !== department.hospitalId);
          if (otherHospital) {
            await ctx.db.insert("provider_hospital_access", {
              providerId,
              hospitalId: otherHospital,
            });
          }
        }

        // Add 3-4 random skills
        const numSkills = 3 + (i % 2);
        const selectedSkills = skillIds.slice(0, numSkills);
        for (const skillId of selectedSkills) {
          await ctx.db.insert("provider_skills", {
            providerId,
            skillId,
          });
        }

        providersCreated++;
      }
    }
    results.providersCreated = providersCreated;

    // ─────────────────────────────────────────────────────────────────
    // 8. Create Strike Scenario
    // ─────────────────────────────────────────────────────────────────
    const existingScenario = await ctx.db
      .query("strike_scenarios")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystem._id))
      .first();

    if (!existingScenario) {
      // Create a scenario for next week
      const today = new Date();
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
      const nextFriday = new Date(nextMonday);
      nextFriday.setDate(nextMonday.getDate() + 4);

      const formatDate = (d: Date) => d.toISOString().split("T")[0];

      const scenarioId = await ctx.db.insert("strike_scenarios", {
        healthSystemId: healthSystem._id,
        hospitalId: hospitalIds[0],
        name: "Nursing Strike - Week 1",
        description: "Planned nursing strike affecting RN and NP staff. Full replacement coverage needed for ICU and Medicine floors.",
        startDate: formatDate(nextMonday),
        endDate: formatDate(nextFriday),
        affectedJobTypes: [
          { jobTypeId: jobTypeMap["NP"], reductionPercent: 100 },
          { jobTypeId: jobTypeMap["RN"], reductionPercent: 100 },
        ],
        status: "Active",
        createdBy: systemUser._id,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Generate positions for each day of the scenario
      let positionsCreated = 0;
      const hospital = await ctx.db.get(hospitalIds[0]);

      // Get services for this hospital
      const hospitalServices = await ctx.db
        .query("services")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalIds[0]))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      for (const service of hospitalServices) {
        const serviceJobTypes = await ctx.db
          .query("service_job_types")
          .withIndex("by_service", (q) => q.eq("serviceId", service._id))
          .collect();

        for (const sjt of serviceJobTypes) {
          const jobType = await ctx.db.get(sjt.jobTypeId);
          if (!jobType) continue;

          // Only create positions for affected job types
          const isAffected = ["NP", "RN"].includes(jobType.code);
          if (!isAffected) continue;

          // Create positions for each day
          let currentDate = new Date(nextMonday);
          while (currentDate <= nextFriday) {
            const dateStr = formatDate(currentDate);
            const isWeekend = currentDate.getDay() === 0 || currentDate.getDay() === 6;

            // AM shift positions
            if (service.operatesDays) {
              const amHeadcount = isWeekend
                ? (sjt.weekendAmHeadcount || sjt.headcount || 1)
                : (sjt.weekdayAmHeadcount || sjt.headcount || 1);

              for (let pos = 1; pos <= amHeadcount; pos++) {
                const jobCode = `${service.shortCode}_${jobType.code}_${dateStr}_AM_${pos}`;
                await ctx.db.insert("scenario_positions", {
                  scenarioId,
                  serviceId: service._id,
                  serviceJobTypeId: sjt._id,
                  jobTypeId: sjt.jobTypeId,
                  hospitalId: hospitalIds[0],
                  departmentId: service.departmentId,
                  date: dateStr,
                  shiftType: "AM",
                  shiftStart: "07:00",
                  shiftEnd: "19:00",
                  positionNumber: pos,
                  jobCode,
                  originalHeadcount: amHeadcount,
                  scenarioHeadcount: amHeadcount,
                  status: "Open",
                  isActive: true,
                });
                positionsCreated++;
              }
            }

            // PM shift positions
            if (service.operatesNights) {
              const pmHeadcount = isWeekend
                ? (sjt.weekendPmHeadcount || Math.ceil((sjt.headcount || 1) * 0.8))
                : (sjt.weekdayPmHeadcount || Math.ceil((sjt.headcount || 1) * 0.8));

              for (let pos = 1; pos <= pmHeadcount; pos++) {
                const jobCode = `${service.shortCode}_${jobType.code}_${dateStr}_PM_${pos}`;
                await ctx.db.insert("scenario_positions", {
                  scenarioId,
                  serviceId: service._id,
                  serviceJobTypeId: sjt._id,
                  jobTypeId: sjt.jobTypeId,
                  hospitalId: hospitalIds[0],
                  departmentId: service.departmentId,
                  date: dateStr,
                  shiftType: "PM",
                  shiftStart: "19:00",
                  shiftEnd: "07:00",
                  positionNumber: pos,
                  jobCode,
                  originalHeadcount: pmHeadcount,
                  scenarioHeadcount: pmHeadcount,
                  status: "Open",
                  isActive: true,
                });
                positionsCreated++;
              }
            }

            currentDate.setDate(currentDate.getDate() + 1);
          }
        }
      }

      results.scenarioCreated = true;
      results.scenarioId = scenarioId;
      results.positionsCreated = positionsCreated;

      // ─────────────────────────────────────────────────────────────────
      // 9. Create Provider Availability for the scenario
      // ─────────────────────────────────────────────────────────────────
      const providers = await ctx.db
        .query("providers")
        .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystem._id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .take(30);

      let availabilityCreated = 0;
      for (const provider of providers) {
        // Each provider is available for some of the days
        let currentDate = new Date(nextMonday);
        while (currentDate <= nextFriday) {
          const dateStr = formatDate(currentDate);

          // 70% chance of being available
          if (Math.random() < 0.7) {
            const amAvailable = Math.random() < 0.8;
            const pmAvailable = Math.random() < 0.6;

            if (amAvailable || pmAvailable) {
              await ctx.db.insert("provider_availability", {
                providerId: provider._id,
                scenarioId,
                date: dateStr,
                availabilityType: "available",
                amAvailable,
                pmAvailable,
                amPreferred: amAvailable && Math.random() < 0.3,
                pmPreferred: pmAvailable && Math.random() < 0.3,
                enteredBy: systemUser._id,
                enteredAt: Date.now(),
                source: "bulk_import",
              });
              availabilityCreated++;
            }
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
      results.availabilityCreated = availabilityCreated;
    } else {
      results.scenarioCreated = false;
      results.scenarioId = existingScenario._id;
    }

    return {
      success: true,
      message: "Demo data seeded successfully!",
      ...results,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════
// RESET DEMO DATA (for testing)
// ═══════════════════════════════════════════════════════════════════

export const resetDemoData = mutation({
  args: {},
  handler: async (ctx) => {
    const healthSystem = await ctx.db
      .query("health_systems")
      .withIndex("by_slug", (q) => q.eq("slug", DEMO_HEALTH_SYSTEM.slug))
      .first();

    if (!healthSystem) {
      return { success: false, message: "No demo data found to reset" };
    }

    // Delete in reverse dependency order
    // 1. Provider availability
    const availabilities = await ctx.db.query("provider_availability").collect();
    for (const a of availabilities) {
      await ctx.db.delete(a._id);
    }

    // 2. Scenario assignments
    const scenarioAssignments = await ctx.db.query("scenario_assignments").collect();
    for (const sa of scenarioAssignments) {
      await ctx.db.delete(sa._id);
    }

    // 3. Scenario positions
    const scenarioPositions = await ctx.db.query("scenario_positions").collect();
    for (const sp of scenarioPositions) {
      await ctx.db.delete(sp._id);
    }

    // 4. Strike scenarios
    const scenarios = await ctx.db
      .query("strike_scenarios")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystem._id))
      .collect();
    for (const s of scenarios) {
      await ctx.db.delete(s._id);
    }

    // 5. Provider skills
    const providerSkills = await ctx.db.query("provider_skills").collect();
    for (const ps of providerSkills) {
      await ctx.db.delete(ps._id);
    }

    // 6. Provider hospital access
    const providerAccess = await ctx.db.query("provider_hospital_access").collect();
    for (const pa of providerAccess) {
      await ctx.db.delete(pa._id);
    }

    // 7. Providers
    const providers = await ctx.db
      .query("providers")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystem._id))
      .collect();
    for (const p of providers) {
      await ctx.db.delete(p._id);
    }

    // 8. Shifts
    const shifts = await ctx.db.query("shifts").collect();
    for (const sh of shifts) {
      await ctx.db.delete(sh._id);
    }

    // 9. Service job type skills
    const sjtSkills = await ctx.db.query("service_job_type_skills").collect();
    for (const sjts of sjtSkills) {
      await ctx.db.delete(sjts._id);
    }

    // 10. Service job types
    const sjtypes = await ctx.db.query("service_job_types").collect();
    for (const sjt of sjtypes) {
      await ctx.db.delete(sjt._id);
    }

    // 11. Services
    const services = await ctx.db
      .query("services")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystem._id))
      .collect();
    for (const svc of services) {
      await ctx.db.delete(svc._id);
    }

    // 12. Departments
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystem._id))
      .collect();
    for (const d of departments) {
      await ctx.db.delete(d._id);
    }

    // 13. Hospitals
    const hospitals = await ctx.db
      .query("hospitals")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystem._id))
      .collect();
    for (const h of hospitals) {
      await ctx.db.delete(h._id);
    }

    // 14. Job types
    const jobTypes = await ctx.db
      .query("job_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystem._id))
      .collect();
    for (const jt of jobTypes) {
      await ctx.db.delete(jt._id);
    }

    // 15. Health system
    await ctx.db.delete(healthSystem._id);

    return { success: true, message: "Demo data reset successfully" };
  },
});
