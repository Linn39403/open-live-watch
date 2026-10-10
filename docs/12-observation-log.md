# Local observation log

Session date: 2026-10-10, Asia/Singapore. Application: Micrium µC/Probe Professional 4.8.2.0. Observed through Windows Computer Use. Proprietary screenshots are intentionally not committed; these are original descriptive notes.

## O01 Workspace and accessibility inventory

Open project was marked unsaved. Project tree contained a project and one data screen. Center showed a grid/rulers, one large angular gauge and a selected linear gauge. Status: Stopped. Symbol table empty. Ribbon: File/Design/View; run, settings, layout lock, clipboard, pointer/text/picture/connector/shape tools, shape styling, arrangement, font and paragraph. Bottom browser: ELF/I-O/CSF/MQTT imports, search name/type, bounds and typed metadata columns; array/structure/bit-field tabs.

Toolbox/accessibility inventory exposed sliders (vertical/horizontal/custom), custom switch, checkbox, push/toggle/repeat, bit control, numeric up/down, textbox, radio buttons, RGB palette, choice list; angular/linear gauge variants; chart/numeric/miscellaneous/advanced controls; basic/flow/arrow shapes. A control's accessibility description establishes its UI name only.

## O02 Settings dialog

Opened Settings. Embedded Target/Host Application tabs; Cloud Only; TCP/IP, RS-232, USB; J-Link, CMSIS-DAP, Cypress PSoC Prog, ARM Keil µVision, Analog Devices. J-Link pane included speed, SWD mode, manufacturer and device/core list. Little/Big endian controls. Canceled without applying configuration changes. No connection or Run action performed.

## O03 Selected linear-gauge properties

Opened contextual Properties Editor. Tooltip field and formatting controls: Scaling Factor default 1; Scaling Offset default 0. Closed the dialog without changes. Gauge contextual actions included symbols manager, properties, ranges/colors, lock, duplicate/delete, and disabled series properties for this gauge.

## O04 Selected linear-gauge range and color editor

Opened Range & Colors Editor. Observed max=100, min=0, threshold percentages 90/70, three colored bands, RGB numeric values and ARGB text field, color selection palette, and Gradient/Is Reversed/Logarithmic options. Closed without changes. These options establish exposed configuration, not verified logarithmic rendering behavior.

## O05 Insert Screens menu

Opened the Insert Screens menu without inserting anything. It listed Data Screen, µC/OS-II Kernel Awareness, µC/OS-III Kernel Awareness, µC/TCP-IP Awareness, µC/OS LIB-Mem Awareness, Micrium OS Kernel, Micrium OS Net (TCP/IP), FreeRTOS Kernel, Oscilloscope, and Memory Dump Screen. The menu confirms exposed screen types; their data acquisition remains untested.

## Observation discipline

Target runtime was not started. Existing unsaved workspace was preserved. Dialog inspection and manual reading supplied evidence; hardware transport correctness, target timing, write acknowledgements and captures remain unverified. See sources-and-gaps for follow-up experiments.
