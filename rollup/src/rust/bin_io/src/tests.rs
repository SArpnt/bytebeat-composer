use crate::traits::*;
use crate::base::*;
#[cfg(feature = "library")]
use crate::library::*;

#[test]
fn read_write_nums() {
	use std::io::{Read, BufReader};

	let mut buf = Vec::<u8>::new();

	(42 as u8).write(&mut buf);
	(42 as u16).write(&mut buf);
	(42 as u32).write(&mut buf);
	(42 as u64).write(&mut buf);
	(42 as u128).write(&mut buf);
	(-42 as i8).write(&mut buf);
	(-42 as i16).write(&mut buf);
	(-42 as i32).write(&mut buf);
	(-42 as i64).write(&mut buf);
	(-42 as i128).write(&mut buf);
	(-38.42 as f32).write(&mut buf);
	(-38.42 as f64).write(&mut buf);

	let mut bufreader = BufReader::new(buf.as_slice());

	assert_eq!(u8::read(&mut bufreader), 42_u8);
	assert_eq!(u16::read(&mut bufreader), 42_u16);
	assert_eq!(u32::read(&mut bufreader), 42_u32);
	assert_eq!(u64::read(&mut bufreader), 42_u64);
	assert_eq!(u128::read(&mut bufreader), 42_u128);
	assert_eq!(i8::read(&mut bufreader), -42_i8);
	assert_eq!(i16::read(&mut bufreader), -42_i16);
	assert_eq!(i32::read(&mut bufreader), -42_i32);
	assert_eq!(i64::read(&mut bufreader), -42_i64);
	assert_eq!(i128::read(&mut bufreader), -42_i128);
	assert_eq!(f32::read(&mut bufreader), -38.42_f32);
	assert_eq!(f64::read(&mut bufreader), -38.42_f64);

	let mut remaining = Vec::<u8>::new();
	assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
}
#[test]
fn read_write_string() {
	use std::io::{Read, BufReader};
	use std::ffi::{CStr, CString};

	let mut buf = Vec::<u8>::new();

	CStr::from_bytes_with_nul("cstring test ß\0".as_bytes()).unwrap().write(&mut buf);
	String::from("rust string test ß").write(&mut buf);

	let mut bufreader = BufReader::new(buf.as_slice());

	assert_eq!(CString::read(&mut bufreader), CString::new("cstring test ß").unwrap());
	assert_eq!(String::read(&mut bufreader), String::from("rust string test ß"));

	let mut remaining = Vec::<u8>::new();
	assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
}
#[test]
fn read_write_vecs() {
	use std::io::{Read, BufReader};

	let mut buf = Vec::<u8>::new();
	let mut buf2 = Vec::<u8>::new();

	{
		let c1 = vec![1_u16, 2_u16, 3_u16, 4_u16];
		let c2 = vec![String::from("one"), String::from("two"), String::from("three")];
		c1.write(&mut buf);
		c2.write(&mut buf);
		c1.write(&mut buf2);
		c2.write(&mut buf2);
	}

	let mut bufreader = BufReader::new(buf.as_slice());
	let mut bufreader2 = BufReader::new(buf2.as_slice());

	{
		let vec1 = Vec::<u16>::read(&mut bufreader);
		let vec2 = Vec::<String>::read(&mut bufreader);

		assert_eq!(vec1.len(), 4);
		assert_eq!(vec1[0], 1_u16);
		assert_eq!(vec1[1], 2_u16);
		assert_eq!(vec1[2], 3_u16);
		assert_eq!(vec1[3], 4_u16);
		assert_eq!(vec2.len(), 3);
		assert_eq!(vec2[0], String::from("one"));
		assert_eq!(vec2[1], String::from("two"));
		assert_eq!(vec2[2], String::from("three"));
	}

	assert_eq!(u16::read(&mut bufreader2), 4_u16);
	assert_eq!(u16::read(&mut bufreader2), 1_u16);
	assert_eq!(u16::read(&mut bufreader2), 2_u16);
	assert_eq!(u16::read(&mut bufreader2), 3_u16);
	assert_eq!(u16::read(&mut bufreader2), 4_u16);
	assert_eq!(u16::read(&mut bufreader2), 3_u16);
	assert_eq!(String::read(&mut bufreader2), String::from("one"));
	assert_eq!(String::read(&mut bufreader2), String::from("two"));
	assert_eq!(String::read(&mut bufreader2), String::from("three"));

	let mut remaining = Vec::<u8>::new();
	assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
	assert_eq!(bufreader2.read_to_end(&mut remaining).unwrap(), 0);
}

#[test]
fn read_vec_with_sync_iter() {
	use std::io::{Read, BufReader};

	let mut buf = Vec::<u8>::new();

	vec![1_u16, 2_u16, 3_u16, 4_u16].write(&mut buf);
	vec![String::from("one"), String::from("two"), String::from("three")].write(&mut buf);

	let mut bufreader = BufReader::new(buf.as_slice());

	let mut iter1 = VecSyncReadIter::<u16>::start_read(&mut bufreader);

	assert_eq!(iter1.len(), 4_usize);
	assert_eq!(iter1.len_raw(), 4_u16);
	assert_eq!(iter1.next(&mut bufreader).unwrap(), 1_u16);
	assert_eq!(iter1.next(&mut bufreader).unwrap(), 2_u16);
	assert_eq!(iter1.next(&mut bufreader).unwrap(), 3_u16);
	assert_eq!(iter1.next(&mut bufreader).unwrap(), 4_u16);
	assert_eq!(iter1.len(), 0);
	assert!(iter1.next(&mut bufreader).is_none());
	assert_eq!(iter1.len(), 0);
	assert_eq!(iter1.collect(&mut bufreader).len(), 0);

	let mut iter2 = VecSyncReadIter::<String>::start_read(&mut bufreader);

	assert_eq!(iter2.len(), 3_usize);
	assert_eq!(iter2.len_raw(), 3_u16);
	assert_eq!(iter2.next(&mut bufreader).unwrap(), String::from("one"));
	let vec2 = iter2.collect(&mut bufreader);
	assert_eq!(vec2.len(), 2);
	assert_eq!(vec2[0], String::from("two"));
	assert_eq!(vec2[1], String::from("three"));

	let mut remaining = Vec::<u8>::new();
	assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
}
#[test]
fn read_vec_with_iter_iter() {
	use std::io::{Read, BufReader};

	let mut buf = Vec::<u8>::new();

	let data = vec![
		vec![11_u8, 12_u8, 13_u8, 14_u8],
		vec![21_u8],
		vec![31_u8, 32_u8, 33_u8, 34_u8],
		vec![],
	];
	data.write(&mut buf);

	let mut bufreader = BufReader::new(buf.as_slice());

	let mut iter = VecIterReadIter::<VecSyncReadIter<u8>>::start_read(&mut bufreader);

	assert_eq!(iter.len(), data.len());
	assert_eq!(iter.len_raw(), data.len() as u16);
	let mut x = 0;
	while let Some(mut i) = iter.next(&mut bufreader) {
		let mut y = 0;
		assert_eq!(i.len(), data[x].len());
		assert_eq!(i.len_raw(), data[x].len() as u16);
		while let Some(n) = i.next(&mut bufreader) {
			println!("n = {}, data[{}][{}] = {}", n, x, y, data[x][y]);
			assert_eq!(n, data[x][y]);
			y += 1;
		}
		assert!(i.next(&mut bufreader).is_none());
		assert_eq!(i.len(), 0);
		x += 1;
	}
	assert!(iter.next(&mut bufreader).is_none());
	assert_eq!(iter.len(), 0);

	let mut remaining = Vec::<u8>::new();
	assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
}

#[cfg(feature = "library")]
#[test]
fn compare_dates() {
	assert!(Date::cnew(0, 12, 12) < Date::cnew(1, 1, 1));
	assert!(Date::cnew(30, 1, 1) < Date::cnew(30, 1, 2));
	assert_eq!(Date::cnew(0xfff, 12, 31), Date::cnew(0xfff, 12, 31));
}
#[cfg(feature = "library")]
#[test]
fn read_write_dates() {
	use std::io::{Read, BufReader};

	assert_eq!(std::mem::size_of::<Option<Date>>(), std::mem::size_of::<Date>());

	let max_date = Date::cnew(0xfff, 12, 31);

	let mut buf = Vec::<u8>::new();

	None.write(&mut buf); // TODO figure out how to specify generic
	Some(Date::cnew(0, 1, 1)).write(&mut buf);
	Some(Date::cnew(2000, 2, 2)).write(&mut buf);
	Some(Date::cnew(4041, 8, 16)).write(&mut buf);
	Some(max_date).write(&mut buf);

	let mut bufreader = BufReader::new(buf.as_slice());

	assert!(Option::<Date>::read(&mut bufreader).is_none());
	assert_eq!(Option::<Date>::read(&mut bufreader).unwrap(), Date::cnew(0, 1, 1));
	assert_eq!(Option::<Date>::read(&mut bufreader).unwrap(), Date::cnew(2000, 2, 2));
	assert_eq!(Option::<Date>::read(&mut bufreader).unwrap(), Date::cnew(4041, 8, 16));
	assert_eq!(Option::<Date>::read(&mut bufreader).unwrap(), max_date);

	let mut remaining = Vec::<u8>::new();
	assert_eq!(bufreader.read_to_end(&mut remaining).unwrap(), 0);
}
