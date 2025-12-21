export interface ServiceFormData {
  title: string
  department: string
  facility: string
  urgency: string
  description: string
  requiredCredentials: string[]
  preferredCredentials: string[]
  yearsExperience: string
  shiftType: string
  shiftsPerWeek: string
  startDate: string
  endDate: string
  payRate: string
  payType: string
  specialSkills: string[]
}

export const defaultServiceFormData: ServiceFormData = {
  title: "",
  department: "",
  facility: "",
  urgency: "",
  description: "",
  requiredCredentials: [],
  preferredCredentials: [],
  yearsExperience: "",
  shiftType: "",
  shiftsPerWeek: "",
  startDate: "",
  endDate: "",
  payRate: "",
  payType: "hourly",
  specialSkills: [],
}
