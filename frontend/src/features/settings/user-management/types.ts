export type UserAccount = {
  id: string
  name: string
  email: string
  mobile: string
  password: string
  designation: string
  departmentName: string
  status: 'Active' | 'Inactive'
}

export type UserForm = {
  name: string
  email: string
  mobile: string
  password: string
  designation: string
  department: string
  status: 'Active' | 'Inactive'
}

export const emptyUserForm: UserForm = {
  name: '',
  email: '',
  mobile: '',
  password: '',
  designation: '',
  department: '',
  status: 'Active',
}
