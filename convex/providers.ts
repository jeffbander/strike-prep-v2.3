import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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

    // Create provider
    const providerId = await ctx.db.insert("providers", {
      healthSystemId: department.healthSystemId,
      hospitalId: department.hospitalId,
      departmentId: args.departmentId,
      jobTypeId: args.jobTypeId,
      firstName: args.firstName,
      lastName: args.lastName,
      employeeId: args.employeeId,
      cellPhone: args.cellPhone,
      email: args.email,
      currentScheduleDays: args.currentScheduleDays,
      currentScheduleTime: args.currentScheduleTime,
      supervisingPhysician: args.supervisingPhysician,
      specialtyCertification: args.specialtyCertification,
      previousExperience: args.previousExperience,
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
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const provider = await ctx.db.get(args.providerId);
    if (!provider) throw new Error("Provider not found");

    const updates: Record<string, string | undefined> = {};
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
