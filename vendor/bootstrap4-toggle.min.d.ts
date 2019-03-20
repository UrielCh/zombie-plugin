interface bootstrapToggleConfig {
    //  | html	"On"	Text of the on toggle label.
    on?: string;
    // | html	"Off"	Text of the off toggle label.
    off?: string;
    // 	"primary"	Style of the on toggle.
    // Possible values are: primary, secondary, success, danger, warning, info, light, dark
    // Refer to Bootstrap Button Options documentation for more information.
    onstyle?: string;
    // 	"light"	Style of the off toggle.
    // Possible values are: primary, secondary, success, danger, warning, info, light, dark
    // Refer to Bootstrap Button Options documentation for more information.
    offstyle?: string;
    // 	null	Size of the toggle. If set to null, button is default/normal size.
    // Possible values are: lg, sm, xs
    // Refer to Bootstrap Button Sizes documentation for more information.
    size?: string
    // 	null	Appends the provided value to the toggle's class attribute. Use this to apply custom styles to the toggle.
    style?: string;
    // 	null	Sets the width of the toggle.
    // If set to null, width will be calculated.
    width?: number;    
    // 	integer	null	Sets the height of the toggle.
    // If set to null, height will be calculated.
    height?: number;
}
