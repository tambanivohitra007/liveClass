import Swal from 'sweetalert2';

/** Pre-configured SweetAlert instance matching the app's design system (light + dark) */
const swal = Swal.mixin({
  customClass: {
    popup: 'rounded-2xl !border-2 !border-gray-800 dark:!border-white/20 !shadow-sm !bg-surface-card',
    title: '!text-gray-900 dark:!text-white',
    htmlContainer: '!text-gray-500 dark:!text-white/60',
    confirmButton: 'px-5 py-2.5 rounded-xl font-semibold text-sm !border-2 !border-gray-800 dark:!border-white/20 !shadow-sm hover:!shadow-md transition-all duration-200',
    cancelButton: 'px-5 py-2.5 rounded-xl font-semibold text-sm !border-2 !border-gray-800 dark:!border-white/20 !shadow-sm hover:!shadow-md transition-all duration-200',
  },
  buttonsStyling: true,
  confirmButtonColor: '#D4566B',   // brand
  cancelButtonColor: '#6b7280',    // gray-500
  reverseButtons: true,
});

export default swal;

/** Destructive confirmation (delete actions) */
export function confirmDelete(itemName: string) {
  return swal.fire({
    title: 'Delete this?',
    html: `<span class="text-gray-500 dark:text-white/60">"<strong>${itemName}</strong>" will be permanently deleted.</span>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#ef4444', // danger red
  });
}

/** Generic action confirmation */
export function confirmAction(title: string, text: string, confirmText = 'Yes, continue') {
  return swal.fire({
    title,
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
  });
}

/** Success alert (auto-closes) */
export function alertSuccess(title: string, text?: string) {
  return swal.fire({
    title,
    text,
    icon: 'success',
    timer: 2000,
    showConfirmButton: false,
  });
}

/** Error alert */
export function alertError(title: string, text?: string) {
  return swal.fire({
    title,
    text,
    icon: 'error',
    confirmButtonText: 'OK',
  });
}
