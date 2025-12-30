import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  safeTextSchema,
  optionalSafeTextSchema,
  optionalPhoneSchema,
  optionalEmailSchema,
  optionalLongTextSchema,
  validateField,
} from "./lib/validation";

/**
 * Create a single provider
 */
export const create = mutation({
  args: {
    departmentId: v.id("departments"),
    jobTypeId: v.id("job_types"),
    firstName: v.string(),
    lastName: v.string(),
    employeeId: v.optional(v.string()),
    cellPhone: v.optional(v.string()),
    email: v.optional(v.string()),
    currentScheduleDays: v.optional(v.string()),
    currentScheduleTime: v.optional(v.string()),
    supervisingPhysician: v.optional(v.string()),
    specialtyCertification: v.optional(v.string()),
    previousExperience: v.optional(v.string()),
    hasVisa: v.optional(v.boolean()),
    skillIds: v.optional(v.array(v.id("skills"))),
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

    // Validate and sanitize input (XSS prevention)
    const firstName = validateField(safeTextSchema, args.firstName, "firstName");
    const lastName = validateField(safeTextSchema, args.lastName, "lastName");
    const employeeId = args.employeeId ? validateField(optionalSafeTextSchema, args.employeeId, "employeeId") : undefined;
    const cellPhone = args.cellPhone ? validateField(optionalPhoneSchema, args.cellPhone, "cellPhone") : undefined;
    const email = args.email ? validateField(optionalEmailSchema, args.email, "email") : undefined;
    const currentScheduleDays = args.currentScheduleDays ? validateField(optionalSafeTextSchema, args.currentScheduleDays, "currentScheduleDays") : undefined;
    const currentScheduleTime = args.currentScheduleTime ? validateField(optionalSafeTextSchema, args.currentScheduleTime, "currentScheduleTime") : undefined;
    const supervisingPhysician = args.supervisingPhysician ? validateField(optionalSafeTextSchema, args.supervisingPhysician, "supervisingPhysician") : undefined;
    const specialtyCertification = args.specialtyCertification ? validateField(optionalSafeTextSchema, args.specialtyCertification, "specialtyCertification") : undefined;
    const previousExperience = args.previousExperience ? validateField(optionalLongTextSchema, args.previousExperience, "previousExperience") : undefined;

    // Create provider with sanitized data
    const providerId = await ctx.db.insert("providers", {
      healthSystemId: department.healthSystemId,
      hospitalId: department.hospitalId,
      departmentId: args.departmentId,
      jobTypeId: args.jobTypeId,
      firstName,
      lastName,
      employeeId,
      cellPhone,
      email,
      currentScheduleDays,
      currentScheduleTime,
      supervisingPhysician,
      specialtyCertification,
      previousExperience,
      hasVisa: args.hasVisa,
      createdBy: currentUser._id,
      isActive: true,
      createdAt: Date.now(),
    });

    // Add home hospital to access list
    await ctx.db.insert("provider_hospital_access", {
      providerId,
      hospitalId: department.hospitalId,
    });

    // Add skills if provided
    if (args.skillIds) {
      for (const skillId of args.skillIds) {
        await ctx.db.insert("provider_skills", {
          providerId,
          skillId,
        });
      }
    }

    return { providerId };
  },
});

/**
 * Bulk upload providers from CSV
 */
export const bulkCreate = mutation({
  args: {
    departmentId: v.id("departments"),
    providers: v.array(
      v.object({
        role: v.string(),
        lastName: v.string(),
        firstName: v.string(),
        employeeId: v.optional(v.string()),
        cellPhone: v.optional(v.string()),
        scheduleDays: v.optional(v.string()),
        scheduleTime: v.optional(v.string()),
        homeSite: v.string(),
        homeDepartment: v.string(),
        supervisingMD: v.optional(v.string()),
        certification: v.optional(v.string()),
        experience: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    const dept = await ctx.db.get(args.departmentId);
    if (!dept) throw new Error("Department not found");

    const results = { created: 0, errors: [] as string[] };

    for (let i = 0; i < args.providers.length; i++) {
      const row = args.providers[i];

      try {
        // Lookup job type by code
        const jobType = await ctx.db
          .query("job_types")
          .withIndex("by_health_system_code", (q) =>
            q.eq("healthSystemId", dept.healthSystemId).eq("code", row.role)
          )
          .first();

        if (!jobType) {
          results.errors.push(`Row ${i + 1}: Invalid role "${row.role}"`);
          continue;
        }

        // Lookup hospital by short code
        const hospital = await ctx.db
          .query("hospitals")
          .withIndex("by_health_system", (q) => q.eq("healthSystemId", dept.healthSystemId))
          .filter((q) => q.eq(q.field("shortCode"), row.homeSite.toUpperCase()))
          .first();

        if (!hospital) {
          results.errors.push(`Row ${i + 1}: Invalid home site "${row.homeSite}"`);
          continue;
        }

        // Lookup department by name
        const homeDept = await ctx.db
          .query("departments")
          .withIndex("by_hospital", (q) => q.eq("hospitalId", hospital._id))
          .filter((q) => q.eq(q.field("name"), row.homeDepartment))
          .first();

        if (!homeDept) {
          results.errors.push(`Row ${i + 1}: Invalid department "${row.homeDepartment}"`);
          continue;
        }

        // Create provider
        const providerId = await ctx.db.insert("providers", {
          healthSystemId: dept.healthSystemId,
          hospitalId: hospital._id,
          departmentId: homeDept._id,
          jobTypeId: jobType._id,
          firstName: row.firstName,
          lastName: row.lastName,
          employeeId: row.employeeId,
          cellPhone: row.cellPhone,
          currentScheduleDays: row.scheduleDays,
          currentScheduleTime: row.scheduleTime,
          supervisingPhysician: row.supervisingMD,
          specialtyCertification: row.certification,
          previousExperience: row.experience,
          createdBy: currentUser._id,
          isActive: true,
          createdAt: Date.now(),
        });

        // Add home hospital to access list
        await ctx.db.insert("provider_hospital_access", {
          providerId,
          hospitalId: hospital._id,
        });

        results.created++;
      } catch (error: any) {
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    return results;
  },
});

/**
 * Bulk create providers with IDs (for frontend Excel upload with mapped IDs)
 */
export const bulkCreateWithIds = mutation({
  args: {
    providers: v.array(
      v.object({
        firstName: v.string(),
        lastName: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        jobTypeId: v.id("job_types"),
        homeDepartmentId: v.id("departments"),
        homeHospitalId: v.id("hospitals"),
        skillIds: v.optional(v.array(v.id("skills"))),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) throw new Error("User not found");

    let created = 0;
    let skipped = 0;

    for (const p of args.providers) {
      // Check for existing provider with same name and department
      const existing = await ctx.db
        .query("providers")
        .withIndex("by_department", (q) => q.eq("departmentId", p.homeDepartmentId))
        .filter((q) =>
          q.and(
            q.eq(q.field("firstName"), p.firstName),
            q.eq(q.field("lastName"), p.lastName)
          )
        )
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      // Get hospital's health system
      const hospital = await ctx.db.get(p.homeHospitalId);
      if (!hospital) continue;

      const providerId = await ctx.db.insert("providers", {
        healthSystemId: hospital.healthSystemId,
        hospitalId: p.homeHospitalId,
        departmentId: p.homeDepartmentId,
        jobTypeId: p.jobTypeId,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        cellPhone: p.phone,
        createdBy: currentUser._id,
        isActive: true,
        createdAt: Date.now(),
      });

      // Add home hospital to access list
      await ctx.db.insert("provider_hospital_access", {
        providerId,
        hospitalId: p.homeHospitalId,
      });

      // Add skills if provided
      if (p.skillIds) {
        for (const skillId of p.skillIds) {
          await ctx.db.insert("provider_skills", {
            providerId,
            skillId,
          });
        }
      }

      created++;
    }

    return { created, skipped };
  },
});

/**
 * Get a single provider by ID
 */
export const get = query({
  args: { providerId: v.id("providers") },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.providerId);
    if (!provider) return null;

    const jobType = await ctx.db.get(provider.jobTypeId);
    const department = await ctx.db.get(provider.departmentId);

    return {
      ...provider,
      jobTypeName: jobType?.name,
      jobTypeCode: jobType?.code,
      departmentName: department?.name,
    };
  },
});

/**
 * List providers based on scope
 */
export const list = query({
  args: {
    departmentId: v.optional(v.id("departments")),
    hospitalId: v.optional(v.id("hospitals")),
    healthSystemId: v.optional(v.id("health_systems")),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();

    if (!currentUser) return [];

    const showInactive = args.includeInactive ?? true; // Default show all for admin view

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let providers: any[] = [];

    if (args.departmentId) {
      const departmentId = args.departmentId;
      if (showInactive) {
        providers = await ctx.db
          .query("providers")
          .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
          .collect();
      } else {
        providers = await ctx.db
          .query("providers")
          .withIndex("by_department_active", (q) =>
            q.eq("departmentId", departmentId).eq("isActive", true)
          )
          .collect();
      }
    } else if (args.hospitalId) {
      const hospitalId = args.hospitalId;
      providers = await ctx.db
        .query("providers")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .collect();
      if (!showInactive) {
        providers = providers.filter((p) => p.isActive);
      }
    } else if (args.healthSystemId) {
      // Filter by health system (for super_admin or health_system_admin)
      const healthSystemId = args.healthSystemId;
      providers = await ctx.db
        .query("providers")
        .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
        .collect();
      if (!showInactive) {
        providers = providers.filter((p) => p.isActive);
      }
    } else if (currentUser.role === "super_admin" || currentUser.role === "health_system_admin") {
      // For super_admin/health_system_admin without filter, use their health system or return empty
      const healthSystemId = currentUser.healthSystemId;
      if (healthSystemId) {
        providers = await ctx.db
          .query("providers")
          .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
          .collect();
        if (!showInactive) {
          providers = providers.filter((p) => p.isActive);
        }
      }
      // If super_admin has no healthSystemId, they need to pass one explicitly
    } else if (currentUser.role === "departmental_admin" && currentUser.departmentId) {
      const departmentId = currentUser.departmentId;
      if (showInactive) {
        providers = await ctx.db
          .query("providers")
          .withIndex("by_department", (q) => q.eq("departmentId", departmentId))
          .collect();
      } else {
        providers = await ctx.db
          .query("providers")
          .withIndex("by_department_active", (q) =>
            q.eq("departmentId", departmentId).eq("isActive", true)
          )
          .collect();
      }
    } else if (currentUser.role === "hospital_admin" && currentUser.hospitalId) {
      const hospitalId = currentUser.hospitalId;
      providers = await ctx.db
        .query("providers")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospitalId))
        .collect();
      if (!showInactive) {
        providers = providers.filter((p) => p.isActive);
      }
    }

    // Fetch job types, skills, and hospital access for display
    const providersWithDetails = await Promise.all(
      providers.map(async (p) => {
        const jobType = await ctx.db.get(p.jobTypeId);
        const skillLinks = await ctx.db
          .query("provider_skills")
          .withIndex("by_provider", (q) => q.eq("providerId", p._id))
          .collect();
        const skillIds = skillLinks.map((s) => s.skillId);

        // Get hospital access
        const accessLinks = await ctx.db
          .query("provider_hospital_access")
          .withIndex("by_provider", (q) => q.eq("providerId", p._id))
          .collect();
        const hospitalAccessIds = accessLinks.map((a) => a.hospitalId);

        return {
          ...p,
          jobType,
          skills: skillIds,
          hospitalAccess: hospitalAccessIds,
          // Alias for frontend compatibility
          homeHospitalId: p.hospitalId,
          homeDepartmentId: p.departmentId,
        };
      })
    );

    return providersWithDetails;
  },
});

/**
 * Get provider with skills and hospital access
 */
export const getWithDetails = query({
  args: { providerId: v.id("providers") },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.providerId);
    if (!provider) return null;

    const jobType = await ctx.db.get(provider.jobTypeId);
    const hospital = await ctx.db.get(provider.hospitalId);
    const department = await ctx.db.get(provider.departmentId);

    const skillLinks = await ctx.db
      .query("provider_skills")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .collect();

    const skills = await Promise.all(skillLinks.map((s) => ctx.db.get(s.skillId)));

    const accessLinks = await ctx.db
      .query("provider_hospital_access")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .collect();

    const hospitalAccess = await Promise.all(accessLinks.map((a) => ctx.db.get(a.hospitalId)));

    return {
      ...provider,
      jobType,
      hospital,
      department,
      skills: skills.filter(Boolean),
      hospitalAccess: hospitalAccess.filter(Boolean),
    };
  },
});

/**
 * Add skill to provider
 */
export const addSkill = mutation({
  args: {
    providerId: v.id("providers"),
    skillId: v.id("skills"),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("provider_skills")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .filter((q) => q.eq(q.field("skillId"), args.skillId))
      .first();

    if (existing) return { success: true, alreadyExists: true };

    await ctx.db.insert("provider_skills", {
      providerId: args.providerId,
      skillId: args.skillId,
    });

    return { success: true };
  },
});

/**
 * Remove skill from provider
 */
export const removeSkill = mutation({
  args: {
    providerId: v.id("providers"),
    skillId: v.id("skills"),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("provider_skills")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .filter((q) => q.eq(q.field("skillId"), args.skillId))
      .first();

    if (link) {
      await ctx.db.delete(link._id);
    }

    return { success: true };
  },
});

/**
 * Add hospital access to provider
 */
export const addHospitalAccess = mutation({
  args: {
    providerId: v.id("providers"),
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("provider_hospital_access")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .filter((q) => q.eq(q.field("hospitalId"), args.hospitalId))
      .first();

    if (existing) return { success: true, alreadyExists: true };

    await ctx.db.insert("provider_hospital_access", {
      providerId: args.providerId,
      hospitalId: args.hospitalId,
    });

    return { success: true };
  },
});

/**
 * Remove hospital access from provider
 */
export const removeHospitalAccess = mutation({
  args: {
    providerId: v.id("providers"),
    hospitalId: v.id("hospitals"),
  },
  handler: async (ctx, args) => {
    const provider = await ctx.db.get(args.providerId);
    if (!provider) throw new Error("Provider not found");

    // Can't remove home hospital access
    if (provider.hospitalId === args.hospitalId) {
      throw new Error("Cannot remove access to home hospital");
    }

    const link = await ctx.db
      .query("provider_hospital_access")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .filter((q) => q.eq(q.field("hospitalId"), args.hospitalId))
      .first();

    if (link) {
      await ctx.db.delete(link._id);
    }

    return { success: true };
  },
});

/**
 * Update provider details
 */
export const update = mutation({
  args: {
    providerId: v.id("providers"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    cellPhone: v.optional(v.string()),
    jobTypeId: v.optional(v.id("job_types")),
    employeeId: v.optional(v.string()),
    currentScheduleDays: v.optional(v.string()),
    currentScheduleTime: v.optional(v.string()),
    supervisingPhysician: v.optional(v.string()),
    specialtyCertification: v.optional(v.string()),
    previousExperience: v.optional(v.string()),
    hasVisa: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const provider = await ctx.db.get(args.providerId);
    if (!provider) throw new Error("Provider not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    if (args.firstName !== undefined) updates.firstName = args.firstName;
    if (args.lastName !== undefined) updates.lastName = args.lastName;
    if (args.email !== undefined) updates.email = args.email;
    if (args.cellPhone !== undefined) updates.cellPhone = args.cellPhone;
    if (args.employeeId !== undefined) updates.employeeId = args.employeeId;
    if (args.currentScheduleDays !== undefined) updates.currentScheduleDays = args.currentScheduleDays;
    if (args.currentScheduleTime !== undefined) updates.currentScheduleTime = args.currentScheduleTime;
    if (args.supervisingPhysician !== undefined) updates.supervisingPhysician = args.supervisingPhysician;
    if (args.specialtyCertification !== undefined) updates.specialtyCertification = args.specialtyCertification;
    if (args.previousExperience !== undefined) updates.previousExperience = args.previousExperience;
    if (args.hasVisa !== undefined) updates.hasVisa = args.hasVisa;

    // Handle jobTypeId separately since it's an Id type
    if (args.jobTypeId !== undefined) {
      await ctx.db.patch(args.providerId, { ...updates, jobTypeId: args.jobTypeId });
    } else {
      await ctx.db.patch(args.providerId, updates);
    }

    return { success: true };
  },
});

/**
 * Toggle provider active status
 */
export const toggleActive = mutation({
  args: { providerId: v.id("providers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const provider = await ctx.db.get(args.providerId);
    if (!provider) throw new Error("Provider not found");

    await ctx.db.patch(args.providerId, { isActive: !provider.isActive });

    return { isActive: !provider.isActive };
  },
});

/**
 * Get hospital access list for a provider
 */
export const getHospitalAccess = query({
  args: { providerId: v.id("providers") },
  handler: async (ctx, args) => {
    const accessLinks = await ctx.db
      .query("provider_hospital_access")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .collect();

    const hospitals = await Promise.all(
      accessLinks.map(async (link) => {
        const hospital = await ctx.db.get(link.hospitalId);
        return hospital;
      })
    );

    return hospitals.filter(Boolean);
  },
});

/**
 * Get provider export data for CSV/Excel export
 * Returns all providers with reference data for import template
 */
export const getProviderExportData = query({
  args: {
    healthSystemId: v.optional(v.id("health_systems")),
    hospitalId: v.optional(v.id("hospitals")),
    departmentId: v.optional(v.id("departments")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!currentUser) return null;

    // Determine health system to query
    let healthSystemId = args.healthSystemId;
    if (!healthSystemId && currentUser.healthSystemId) {
      healthSystemId = currentUser.healthSystemId;
    }
    if (!healthSystemId) return null;

    // Query providers based on scope
    let providers;
    if (args.departmentId) {
      const deptId = args.departmentId;
      providers = await ctx.db
        .query("providers")
        .withIndex("by_department", (q) => q.eq("departmentId", deptId))
        .collect();
    } else if (args.hospitalId) {
      const hospId = args.hospitalId;
      providers = await ctx.db
        .query("providers")
        .withIndex("by_hospital", (q) => q.eq("hospitalId", hospId))
        .collect();
    } else {
      providers = await ctx.db
        .query("providers")
        .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
        .collect();
    }

    // Build rows with all CSV fields
    const rows = await Promise.all(
      providers.map(async (p) => {
        const jobType = await ctx.db.get(p.jobTypeId);
        const hospital = await ctx.db.get(p.hospitalId);
        const department = await ctx.db.get(p.departmentId);

        // Get provider skills
        const skillLinks = await ctx.db
          .query("provider_skills")
          .withIndex("by_provider", (q) => q.eq("providerId", p._id))
          .collect();
        const skills = await Promise.all(
          skillLinks.map(async (link) => {
            const skill = await ctx.db.get(link.skillId);
            return skill?.name || "";
          })
        );

        return {
          role: jobType?.code || "",
          lastName: p.lastName,
          firstName: p.firstName,
          employeeId: p.employeeId || "",
          cellPhone: p.cellPhone || "",
          email: p.email || "",
          currentScheduleDays: p.currentScheduleDays || "",
          currentScheduleTime: p.currentScheduleTime || "",
          homeSite: hospital?.shortCode || "",
          homeDepartment: department?.name || "",
          supervisingPhysician: p.supervisingPhysician || "",
          specialtyCertification: p.specialtyCertification || "",
          previousExperience: p.previousExperience || "",
          hasVisa: p.hasVisa ? "Yes" : "No",
          skills: skills.filter(Boolean).join(", "),
        };
      })
    );

    // Get reference data for template
    const availableRoles = await ctx.db
      .query("job_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const availableSkills = await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const availableHospitals = await ctx.db
      .query("hospitals")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", healthSystemId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Get departments for all hospitals
    const availableDepartments = await Promise.all(
      availableHospitals.map(async (hospital) => {
        const depts = await ctx.db
          .query("departments")
          .withIndex("by_hospital", (q) => q.eq("hospitalId", hospital._id))
          .filter((q) => q.eq(q.field("isActive"), true))
          .collect();
        return depts.map((d) => ({
          ...d,
          hospitalShortCode: hospital.shortCode,
        }));
      })
    );

    return {
      rows,
      availableRoles: availableRoles.map((r) => ({ name: r.name, code: r.code })),
      availableSkills: availableSkills.map((s) => ({ name: s.name, category: s.category })),
      availableHospitals: availableHospitals.map((h) => ({
        name: h.name,
        shortCode: h.shortCode,
      })),
      availableDepartments: availableDepartments.flat().map((d) => ({
        name: d.name,
        hospitalShortCode: d.hospitalShortCode,
      })),
      existingEmails: providers
        .filter((p) => p.email)
        .map((p) => p.email!.toLowerCase()),
    };
  },
});

/**
 * Bulk upsert providers from CSV/Excel
 * Email is the unique key - updates existing provider if email matches, creates new otherwise
 */
export const bulkUpsertProviders = mutation({
  args: {
    healthSystemId: v.id("health_systems"),
    rows: v.array(
      v.object({
        role: v.string(), // Job type code (e.g., "MD", "NP", "PA", "RN", "FEL", "RES")
        lastName: v.string(),
        firstName: v.string(),
        employeeId: v.optional(v.string()),
        cellPhone: v.string(), // Required per user requirements
        email: v.string(), // Required, unique key for upsert
        currentScheduleDays: v.optional(v.string()),
        currentScheduleTime: v.optional(v.string()),
        homeSite: v.string(), // Hospital short code
        homeDepartment: v.string(), // Department name
        supervisingPhysician: v.optional(v.string()),
        specialtyCertification: v.optional(v.string()),
        previousExperience: v.optional(v.string()),
        hasVisa: v.boolean(),
        skills: v.array(v.string()), // Skill names
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!currentUser) throw new Error("User not found");

    // Verify health system access
    if (
      currentUser.role !== "super_admin" &&
      currentUser.healthSystemId !== args.healthSystemId
    ) {
      throw new Error("Access denied to this health system");
    }

    // Build lookup maps for validation
    const jobTypes = await ctx.db
      .query("job_types")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", args.healthSystemId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const jobTypeByCode = new Map(
      jobTypes.map((jt) => [jt.code.toUpperCase(), jt])
    );

    const hospitals = await ctx.db
      .query("hospitals")
      .withIndex("by_health_system", (q) => q.eq("healthSystemId", args.healthSystemId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const hospitalByCode = new Map(
      hospitals.map((h) => [h.shortCode.toUpperCase(), h])
    );

    const skills = await ctx.db
      .query("skills")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    const skillByName = new Map(skills.map((s) => [s.name.toUpperCase(), s]));

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < args.rows.length; i++) {
      const row = args.rows[i];
      const rowNum = i + 2; // Account for header row in original file

      try {
        // Validate role
        const jobType = jobTypeByCode.get(row.role.toUpperCase());
        if (!jobType) {
          results.errors.push(`Row ${rowNum}: Unknown role "${row.role}"`);
          continue;
        }

        // Validate hospital
        const hospital = hospitalByCode.get(row.homeSite.toUpperCase());
        if (!hospital) {
          results.errors.push(`Row ${rowNum}: Unknown home site "${row.homeSite}"`);
          continue;
        }

        // Validate department (within hospital) - case-insensitive match
        const hospitalDepartments = await ctx.db
          .query("departments")
          .withIndex("by_hospital", (q) => q.eq("hospitalId", hospital._id))
          .filter((q) => q.eq(q.field("isActive"), true))
          .collect();
        const department = hospitalDepartments.find(
          (d) => d.name.toLowerCase() === row.homeDepartment.toLowerCase()
        );
        if (!department) {
          results.errors.push(
            `Row ${rowNum}: Unknown department "${row.homeDepartment}" in ${row.homeSite}`
          );
          continue;
        }

        // Validate skills - reject row if any skill is unknown
        const validSkillIds: typeof skills[0]["_id"][] = [];
        let hasInvalidSkill = false;
        for (const skillName of row.skills) {
          if (!skillName.trim()) continue;
          const skill = skillByName.get(skillName.trim().toUpperCase());
          if (skill) {
            validSkillIds.push(skill._id);
          } else {
            results.errors.push(
              `Row ${rowNum}: Unknown skill "${skillName}" - row rejected`
            );
            hasInvalidSkill = true;
            break;
          }
        }
        if (hasInvalidSkill) continue;

        // Check for existing provider by email (within health system)
        const normalizedEmail = row.email.toLowerCase().trim();
        const existingProvider = await ctx.db
          .query("providers")
          .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
          .filter((q) => q.eq(q.field("healthSystemId"), args.healthSystemId))
          .first();

        if (existingProvider) {
          // UPDATE existing provider
          await ctx.db.patch(existingProvider._id, {
            jobTypeId: jobType._id,
            firstName: row.firstName,
            lastName: row.lastName,
            employeeId: row.employeeId,
            cellPhone: row.cellPhone,
            currentScheduleDays: row.currentScheduleDays,
            currentScheduleTime: row.currentScheduleTime,
            hospitalId: hospital._id,
            departmentId: department._id,
            supervisingPhysician: row.supervisingPhysician,
            specialtyCertification: row.specialtyCertification,
            previousExperience: row.previousExperience,
            hasVisa: row.hasVisa,
            updatedAt: Date.now(),
          });

          // Sync skills
          await syncProviderSkills(ctx, existingProvider._id, validSkillIds);

          // Update hospital access if home hospital changed
          if (existingProvider.hospitalId !== hospital._id) {
            // Ensure new home hospital is in access list
            const existingAccess = await ctx.db
              .query("provider_hospital_access")
              .withIndex("by_provider", (q) =>
                q.eq("providerId", existingProvider._id)
              )
              .filter((q) => q.eq(q.field("hospitalId"), hospital._id))
              .first();
            if (!existingAccess) {
              await ctx.db.insert("provider_hospital_access", {
                providerId: existingProvider._id,
                hospitalId: hospital._id,
              });
            }
          }

          results.updated++;
        } else {
          // CREATE new provider
          const providerId = await ctx.db.insert("providers", {
            healthSystemId: args.healthSystemId,
            hospitalId: hospital._id,
            departmentId: department._id,
            jobTypeId: jobType._id,
            firstName: row.firstName,
            lastName: row.lastName,
            email: normalizedEmail,
            employeeId: row.employeeId,
            cellPhone: row.cellPhone,
            currentScheduleDays: row.currentScheduleDays,
            currentScheduleTime: row.currentScheduleTime,
            supervisingPhysician: row.supervisingPhysician,
            specialtyCertification: row.specialtyCertification,
            previousExperience: row.previousExperience,
            hasVisa: row.hasVisa,
            createdBy: currentUser._id,
            isActive: true,
            createdAt: Date.now(),
          });

          // Add home hospital to access list
          await ctx.db.insert("provider_hospital_access", {
            providerId,
            hospitalId: hospital._id,
          });

          // Add skills
          for (const skillId of validSkillIds) {
            await ctx.db.insert("provider_skills", {
              providerId,
              skillId,
            });
          }

          results.created++;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        results.errors.push(`Row ${rowNum}: ${message}`);
      }
    }

    return results;
  },
});

/**
 * Helper: Sync provider skills (remove old, add new)
 */
async function syncProviderSkills(
  ctx: MutationCtx,
  providerId: Id<"providers">,
  newSkillIds: Id<"skills">[]
) {
  // Get existing skills
  const existingLinks = await ctx.db
    .query("provider_skills")
    .withIndex("by_provider", (q) => q.eq("providerId", providerId))
    .collect();

  const existingIds = new Set(existingLinks.map((l) => l.skillId.toString()));
  const newIds = new Set(newSkillIds.map((id) => id.toString()));

  // Remove skills no longer in list
  for (const link of existingLinks) {
    if (!newIds.has(link.skillId.toString())) {
      await ctx.db.delete(link._id);
    }
  }

  // Add new skills
  for (const skillId of newSkillIds) {
    if (!existingIds.has(skillId.toString())) {
      await ctx.db.insert("provider_skills", { providerId, skillId });
    }
  }
}
