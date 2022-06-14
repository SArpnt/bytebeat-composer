use wasm_bindgen::prelude::*;
use web_sys::{ReadableStream, Element};
//use bin_io::{VecSyncReadIter, VecIterReadIter};
use bin_io::traits::*;
use std::io::BufReader;
mod library_structs;
use library_structs::*;

extern crate wee_alloc;
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;


thread_local! {
	static WINDOW: web_sys::Window = web_sys::window().expect("no global window");
	static DOCUMENT: web_sys::Document = WINDOW.with(|w| w.document().expect("no global document"));
}

#[wasm_bindgen]
pub fn load_library() {
	let buf : [u8; 0] = [];
	let mut reader = BufReader::new(&buf as &[u8]);
	let mut playlist = PlaylistIter::start_read(&mut reader);
	let playlist_elem = {
		let mut playlist_id = String::with_capacity("library-".len() + playlist.name.len());
		playlist_id.push_str("library-");
		playlist_id.push_str(playlist.name.as_str());
		DOCUMENT.with(|d| d.get_element_by_id(playlist_id.as_str()).expect("couldn't find playlist elem"))
	};
	while let Some(entry) = playlist.content.next(&mut reader) {
		let entry_elem = DOCUMENT.with(|d| d.create_element("li").unwrap());
		load_entry(entry, &entry_elem, &mut reader);
		playlist_elem.append_with_node_1(&entry_elem).unwrap();
	}
}

fn load_entry(mut entry: LibraryEntryIter, entry_elem: &Element, reader: &mut BufReader<&[u8]>) {
	let text = DOCUMENT.with(|d| d.create_text_node("rust test"));
	entry_elem.append_with_node_1(&text).unwrap();
	
	let children_elem = DOCUMENT.with(|d| d.create_element("ul").unwrap());
	entry_elem.append_with_node_1(&children_elem).unwrap();
	while let Some(child_entry) = entry.children.next(reader) {
		let child_elem = DOCUMENT.with(|d| d.create_element("li").unwrap());
		load_entry(child_entry, &child_elem, reader);
		children_elem.append_with_node_1(&child_elem).unwrap();
	}
}
