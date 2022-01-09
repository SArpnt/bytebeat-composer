export default function isPlainObject(value) {
	if (value && typeof value === "object") {
		const proto = Object.getPrototypeOf(value);
		if (proto && !Object.getPrototypeOf(proto))
			return true;
	}
	return false;
}