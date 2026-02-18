import Swal from 'sweetalert2';

/** Pre-configured SweetAlert instance matching the app's comic design system */
const swal = Swal.mixin({
  customClass: {
    popup: 'rounded-2xl !border-2 !border-gray-800 !shadow-[4px_4px_0px_0px_#D4566B]',
    confirmButton: 'px-5 py-2.5 rounded-xl font-semibold text-sm !border-2 !border-gray-800 !shadow-[3px_3px_0px_0px_#D4566B] hover:!shadow-[5px_5px_0px_0px_#D4566B] hover:!translate-x-[-2px] hover:!translate-y-[-2px] transition-all duration-300',
    cancelButton: 'px-5 py-2.5 rounded-xl font-semibold text-sm !border-2 !border-gray-800 !shadow-[2px_2px_0px_0px_#6b7280] hover:!shadow-[4px_4px_0px_0px_#6b7280] hover:!translate-x-[-1px] hover:!translate-y-[-1px] transition-all duration-300',
  },
  buttonsStyling: true,
  confirmButtonColor: '#e63b55',   // brand
  cancelButtonColor: '#6b7280',    // gray-500
  reverseButtons: true,
});

export default swal;

/** Destructive confirmation (delete actions) */
export function confirmDelete(itemName: string) {
  return swal.fire({
    title: 'Delete this?',
    html: `<span class="text-gray-500">"<strong>${itemName}</strong>" will be permanently deleted.</span>`,
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
